// resources/js/sync/ConflictResolver.js

import { SYNC_STATUS } from '../constants/syncStatus';

/**
 * Conflict resolution strategies for field-level merge.
 *
 * Since records are UUID-based and track revisions per-field,
 * conflicts occur when both local and server versions have incremented
 * their revision since the last sync.
 *
 * Approaches supported:
 *  - LWW (Last-Write-Wins): Highest revision wins.
 *  - FIELD_LEVEL: Non-conflicting fields auto-merge; conflicting fields flagged.
 *  - MANUAL: Flag entire record for user review.
 */

export const RESOLVE_STRATEGY = {
    LWW:         'lww',          // highest revision wins
    LOCAL_WINS:  'local_wins',   // always take local version
    SERVER_WINS: 'server_wins',  // always take server version
    FIELD_LEVEL: 'field_level',  // merge non-conflicting fields, flag conflicts
    MANUAL:      'manual',       // don't auto-resolve, flag for user
};

/**
 * Detect whether a record has a sync conflict.
 *
 * Conflict = both localRevision AND serverRevision have increased
 * since the last common sync point.
 *
 * @param {object} localRecord  — from local DB (has _localRevision, _serverRevision)
 * @param {object} serverRecord — from server pull response (has _serverRevision)
 * @param {number} lastSyncServerRevision — the serverRevision at the time of last successful sync
 * @returns {boolean}
 */
export function hasConflict(localRecord, serverRecord, lastSyncServerRevision = 0) {
    const localRev = localRecord._localRevision || 0;
    const serverRev = serverRecord._serverRevision || serverRecord.serverRevision || 0;
    const lastSyncRev = lastSyncServerRevision || 0;

    // Conflict when both sides have changes since last sync
    const localChanged = localRev > 0; // always true for local edits (we bump on every change)
    const serverChanged = serverRev > lastSyncRev;

    return localChanged && serverChanged;
}

/**
 * Detect which fields conflict between local and server versions.
 *
 * A field conflicts if both local and server changed it relative to a common ancestor.
 * If only one side changed a field, it auto-merges.
 *
 * @param {object} local   — local record
 * @param {object} server  — server record
 * @param {object} ancestor — last known common state (optional, uses lastSyncRevision check)
 * @returns {{ conflicts: string[], merged: object }}
 */
export function detectFieldConflicts(local, server, ancestor = null) {
    const conflictFields = [];
    const merged = { ...server }; // start with server as base

    // Trackable fields (exclude internal sync fields)
    const trackableFields = [
        'name', 'description', 'start', 'end', 'public',
        'type', 'parent_id', 'data',
    ];

    for (const field of trackableFields) {
        const localVal = local[field];
        const serverVal = server[field];
        const ancestorVal = ancestor ? ancestor[field] : undefined;

        // If only local changed (or only server changed), auto-merge
        if (JSON.stringify(localVal) !== JSON.stringify(serverVal)) {
            if (ancestor) {
                const localChanged = JSON.stringify(localVal) !== JSON.stringify(ancestorVal);
                const serverChanged = JSON.stringify(serverVal) !== JSON.stringify(ancestorVal);

                if (localChanged && serverChanged) {
                    // Both changed the same field — conflict
                    conflictFields.push(field);
                    // Keep local version tentatively, flag will mark it
                    merged[field] = localVal;
                } else if (localChanged) {
                    // Only local changed — auto-merge local
                    merged[field] = localVal;
                }
                // else: only server changed — keep server value (already in merged)
            } else {
                // No ancestor — treat as conflict if both differ
                conflictFields.push(field);
                merged[field] = localVal; // prefer local as default
            }
        }
    }

    return { conflicts: conflictFields, merged };
}

/**
 * Resolve a conflict using the specified strategy.
 *
 * @param {object} local      — local record
 * @param {object} server     — server record
 * @param {string} strategy   — one of RESOLVE_STRATEGY
 * @param {object} [options]
 * @param {object} [options.ancestor]   — common ancestor record
 * @param {object} [options.fieldOverrides] — manual field selection: { name: 'local', description: 'server' }
 * @returns {{ resolved: object, strategy: string, conflictingFields: string[] }}
 */
export function resolveConflict(local, server, strategy, options = {}) {
    const result = {
        resolved: null,
        strategy,
        conflictingFields: [],
    };

    switch (strategy) {
        case RESOLVE_STRATEGY.LOCAL_WINS:
            result.resolved = {
                ...server,
                ...local,
                _syncStatus: SYNC_STATUS.LOCAL,
                _localRevision: (local._localRevision || 0) + 1,
                _serverRevision: server._serverRevision || server.serverRevision || 0,
            };
            break;

        case RESOLVE_STRATEGY.SERVER_WINS:
            result.resolved = {
                ...server,
                _syncStatus: SYNC_STATUS.SERVER_ONLY,
                _localRevision: 0,
                _serverRevision: server._serverRevision || server.serverRevision || 0,
            };
            break;

        case RESOLVE_STRATEGY.LWW:
            if ((local._localRevision || 0) >= (server._serverRevision || server.serverRevision || 0)) {
                // Local wins
                result.resolved = {
                    ...server,
                    ...local,
                    _syncStatus: SYNC_STATUS.LOCAL,
                    _localRevision: (local._localRevision || 0) + 1,
                    _serverRevision: server._serverRevision || server.serverRevision || 0,
                };
                result.strategy = RESOLVE_STRATEGY.LOCAL_WINS;
            } else {
                // Server wins
                result.resolved = {
                    ...server,
                    _syncStatus: SYNC_STATUS.SERVER_ONLY,
                    _localRevision: 0,
                    _serverRevision: server._serverRevision || server.serverRevision || 0,
                };
                result.strategy = RESOLVE_STRATEGY.SERVER_WINS;
            }
            break;

        case RESOLVE_STRATEGY.FIELD_LEVEL: {
            const { conflicts, merged } = detectFieldConflicts(
                local, server, options.ancestor
            );
            result.conflictingFields = conflicts;

            if (conflicts.length === 0) {
                // No conflicts — auto-merged
                result.resolved = {
                    ...merged,
                    _syncStatus: SYNC_STATUS.SYNCED,
                    _localRevision: 0,
                    _serverRevision: server._serverRevision || server.serverRevision || 0,
                };
            } else if (options.fieldOverrides) {
                // Manual field selection applied
                for (const field of conflicts) {
                    if (options.fieldOverrides[field] === 'local') {
                        merged[field] = local[field];
                    } else {
                        // Revert to server value (merged had local as default for conflict fields)
                        merged[field] = server[field];
                    }
                }
                result.resolved = {
                    ...merged,
                    _syncStatus: SYNC_STATUS.LOCAL,
                    _localRevision: (local._localRevision || 0) + 1,
                    _serverRevision: server._serverRevision || server.serverRevision || 0,
                };
            } else {
                // Mark as conflict — no auto-resolution
                result.resolved = {
                    ...merged,
                    _syncStatus: SYNC_STATUS.CONFLICT,
                    _conflictFields: conflicts,
                    _localConflictData: local,
                    _serverConflictData: server,
                    _localRevision: local._localRevision || 0,
                    _serverRevision: server._serverRevision || server.serverRevision || 0,
                };
            }
            break;
        }

        case RESOLVE_STRATEGY.MANUAL:
        default:
            result.resolved = {
                ...server,
                ...local,
                _syncStatus: SYNC_STATUS.CONFLICT,
                _conflictFields: [],
                _localConflictData: local,
                _serverConflictData: server,
                _localRevision: local._localRevision || 0,
                _serverRevision: server._serverRevision || server.serverRevision || 0,
            };
            result.strategy = RESOLVE_STRATEGY.MANUAL;
            break;
    }

    return result;
}
