// packages/engine/src/external/matcher.js
//
// Generic background matcher: schedules objects for external matching,
// runs single-flight queue, stores results in object.data.mbMatch,
// and provides retry with regressive backoff.

import { getProvidersForClasses, getProvider } from './registry.js';
import { promoteObject } from './promoter.js';

/**
 * @typedef {import('./types').Candidate} Candidate
 * @typedef {import('./types').MatchState} MatchState
 */

// ── Config ──

/** @type {number} Interval in ms between retry scans */
const RETRY_INTERVAL_MS = 90_000; // 90s

/** Retry ladder: each level waits this long before retry */
const RETRY_LADDER_MS = [60_000, 300_000, 600_000, 1_200_000, 2_400_000];

/** Max final backoff (40 min) — after this, next retry stays here */
const MAX_RETRY_MS = 40 * 60_000;

// ── Internal state ──

/** @type {Map<string, Promise<any>>} Single-flight queue (thingId → in-flight promise) */
const inflight = new Map();

/** @type {Set<string>} thingIds already scheduled in the periodic scan */
const scheduledForRetry = new Set();

/** @type {number|null} Periodic scan timer handle */
let periodicTimer = null;

/** Current db adapter reference (set during init) */
let dbAdapter = null;

// ── Public API ──

/**
 * Initialize the matcher with a database adapter.
 * @param {import('../localDb/backend/adapter').DbAdapter} db
 */
export function initMatcher(db) {
    dbAdapter = db;
}

/**
 * Attempt to match a single object against registered providers.
 *
 * Steps:
 * 1. Determine eligible providers by the object's class(es)
 * 2. Search each provider (single-flight per thingId)
 * 3. If results with high confidence → state = 'pending'
 * 4. If no good results → state = 'unmatched'
 * 5. On error → state = 'error' with retry scheduling
 *
 * @param {object} thing — Full thing row from the local DB
 * @param {object} [options]
 * @param {string[]} [options.classIds] — Override class detection
 * @returns {Promise<void>}
 */
export async function matchObject(thing, options = {}) {
    const thingId = thing.thing_id;

    // Single-flight: if already matching this thing, wait for that result
    if (inflight.has(thingId)) {
        return inflight.get(thingId);
    }

    const promise = _doMatch(thing, options);
    inflight.set(thingId, promise);
    try {
        await promise;
    } finally {
        inflight.delete(thingId);
    }
}

/**
 * Schedule a match attempt for a thing (queued, not immediate).
 * @param {string} thingId — Thing to match
 * @param {string|string[]} classIds — Class UUID(s) to find providers
 * @param {number} [delayMs] — Delay before attempting
 */
export function scheduleMatch(thingId, classIds, delayMs = 0) {
    const ids = Array.isArray(classIds) ? classIds : [classIds];
    setTimeout(async () => {
        if (!dbAdapter) return;
        const thing = await dbAdapter.things.get(thingId);
        if (!thing || thing.deleted) return;
        await matchObject(thing, { classIds: ids });
    }, delayMs);
}

/**
 * Scan all non-deleted objects, try to match any that haven't been
 * matched yet (state = 'none' or 'unmatched').
 */
export async function scheduleAllUnmatched() {
    if (!dbAdapter) return;
    const all = await dbAdapter.things.toArray();
    for (const thing of all) {
        if (thing.deleted) continue;

        const matchState = _readMatchState(thing);
        if (matchState.state === 'none' || matchState.state === 'unmatched') {
            // Determine classes for this thing
            const classIds = await _getThingClasses(thing.thing_id);
            if (classIds.length === 0) continue;
            const providers = getProvidersForClasses(classIds);
            if (providers.length === 0) continue;

            // Schedule with small random stagger to avoid thundering herd
            const stagger = Math.random() * 2000;
            scheduleMatch(thing.thing_id, classIds, stagger);
        }
    }
}

/**
 * Ensure the periodic retry timer is running.
 * Call once after init.
 */
export function ensurePeriodicRetry() {
    if (periodicTimer) return;
    periodicTimer = setInterval(() => {
        _retryFailed();
    }, RETRY_INTERVAL_MS);
}

/**
 * Stop the periodic retry timer.
 */
export function stopPeriodicRetry() {
    if (periodicTimer) {
        clearInterval(periodicTimer);
        periodicTimer = null;
    }
    scheduledForRetry.clear();
}

/**
 * Confirm a pending match and promote the object.
 * @param {string} thingId
 * @param {Candidate} candidate
 * @param {import('../localDb/backend/adapter').DbAdapter} overrideDb
 */
export async function confirmMatch(thingId, candidate, overrideDb) {
    const db = overrideDb || dbAdapter;
    if (!db) throw new Error('Matcher not initialized — call initMatcher first');

    const thing = await db.things.get(thingId);
    if (!thing) throw new Error(`Thing ${thingId} not found`);

    await promoteObject(thingId, candidate.externalId, candidate.providerKey, {
        db,
        name: candidate.name,
        description: candidate.disambiguation,
        payload: candidate.payload,
    });

    // Stamp confirmation on the canonical row (now at externalId)
    const matchState = _readMatchState(thing);
    matchState.state = 'confirmed';
    matchState.at = Date.now();
    await db.things.update(candidate.externalId, {
        data: { ...(thing.data || {}), mbMatch: matchState },
    });
}

/**
 * Reject all matches for a thing (user says "no match exists").
 * @param {string} thingId
 * @param {import('../localDb/backend/adapter').DbAdapter} [overrideDb]
 */
export async function rejectMatch(thingId, overrideDb) {
    const db = overrideDb || dbAdapter;
    if (!db) return;
    const thing = await db.things.get(thingId);
    if (!thing) return;

    const matchState = _readMatchState(thing);
    matchState.state = 'rejected';
    matchState.at = Date.now();
    await db.things.update(thingId, {
        data: { ...(thing.data || {}), mbMatch: matchState },
    });
}

/**
 * Get match state for a thing.
 * @param {object} thing
 * @returns {MatchState}
 */
export function getMatchState(thing) {
    return _readMatchState(thing);
}

// ── Internal ──

async function _doMatch(thing, options) {
    const thingId = thing.thing_id;
    const classIds = options.classIds || (await _getThingClasses(thingId));

    if (classIds.length === 0) {
        _stampMatchState(thing, { state: 'error', message: 'No classes found' });
        return;
    }

    const providers = getProvidersForClasses(classIds);
    if (providers.length === 0) {
        _stampMatchState(thing, { state: 'error', message: 'No matching providers' });
        return;
    }

    // Try each provider
    for (const provider of providers) {
        _stampMatchState(thing, { state: 'searching' });

        try {
            const candidates = await provider.search(thing.name, {
                description: thing.description,
                data: thing.data,
            });

            if (candidates && candidates.length > 0) {
                const best = candidates.reduce((a, b) =>
                    (a.matchQuality || 0) >= (b.matchQuality || 0) ? a : b
                );

                // High confidence → auto-match pending
                if (best.matchQuality && best.matchQuality >= 0.8) {
                    _stampMatchState(thing, {
                        state: 'pending',
                        results: candidates,
                        best: best,
                    });
                    return;
                }

                // Medium confidence → show all results
                _stampMatchState(thing, {
                    state: 'pending',
                    results: candidates,
                    best: candidates[0],
                });
                return;
            }

            // No results
            _stampMatchState(thing, { state: 'unmatched' });
        } catch (err) {
            console.error(`[matcher] ${provider.key} search failed for ${thingId}:`, err);
            const currentState = _readMatchState(thing);
            const attempts = (currentState.attempts || 0) + 1;
            _stampMatchState(thing, {
                state: 'error',
                message: err.message,
                attempts,
            });
        }
    }
}

async function _getThingClasses(thingId) {
    if (!dbAdapter) return [];
    const links = await dbAdapter.links
        .where('one_thing_id')
        .equals(thingId)
        .toArray();

    return links
        .filter(l => l.link_type_id === 'c217c185-742f-4a9f-8e69-acea2b4f5aea') // LINK_TO_CLASS
        .map(l => l.other_thing_id);
}

function _readMatchState(thing) {
    return (thing.data && thing.data.mbMatch) || { state: 'none', at: 0 };
}

async function _stampMatchState(thing, partial) {
    if (!dbAdapter) return;
    const existing = _readMatchState(thing);
    const next = {
        ...existing,
        ...partial,
        at: Date.now(),
    };
    await dbAdapter.things.update(thing.thing_id, {
        data: { ...(thing.data || {}), mbMatch: next },
    });
}

/** Retry matched objects that are in 'error' state. */
async function _retryFailed() {
    if (!dbAdapter) return;
    const all = await dbAdapter.things.toArray();
    for (const thing of all) {
        if (thing.deleted) continue;

        const matchState = _readMatchState(thing);
        if (matchState.state !== 'error') continue;

        const thingId = thing.thing_id;
        if (scheduledForRetry.has(thingId)) continue;
        scheduledForRetry.add(thingId);

        const attempts = matchState.attempts || 0;
        const delay = _retryDelayForAttempt(attempts);

        setTimeout(() => {
            scheduledForRetry.delete(thingId);
            scheduleAllUnmatched(); // re-scan will pick up this thing
        }, delay);
    }
}

/** Compute retry delay using the regressive ladder. */
function _retryDelayForAttempt(attempt) {
    const idx = Math.min(attempt, RETRY_LADDER_MS.length - 1);
    return RETRY_LADDER_MS[idx] || MAX_RETRY_MS;
}