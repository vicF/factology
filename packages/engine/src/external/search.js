// packages/engine/src/external/search.js
//
// Unified search across registered external providers.

import { getProvidersForClasses } from './registry.js';

/**
 * @typedef {import('./types').Candidate} Candidate
 */

/**
 * Search all registered providers that match the given class IDs.
 * @param {string[]} classIds  — class IDs of the object being matched
 * @param {string} query       — user-facing search string (e.g. object name)
 * @param {object} [ctx]       — additional context (artist name, year, etc.)
 * @returns {Promise<Candidate[]>}
 */
export async function searchProvider(classIds, query, ctx = {}) {
    const providers = getProvidersForClasses(classIds);
    const results = [];
    const errors = [];

    for (const provider of providers) {
        try {
            const candidates = await provider.search(query, ctx);
            for (const c of candidates) {
                results.push(c);
            }
        } catch (err) {
            console.error(`[search] provider ${provider.key} failed:`, err);
            errors.push(err);
        }
    }

    // Sort by match quality descending
    results.sort((a, b) => (b.matchQuality || 0) - (a.matchQuality || 0));

    // If no provider returned results and some errored, propagate the error
    // to the UI so the user sees what went wrong (blocked, rate-limited, etc.)
    if (results.length === 0 && errors.length > 0) {
        throw errors[0];
    }

    return results;
}

/**
 * Fetch a single external record by its external ID (e.g. MBID).
 * @param {string} providerKey
 * @param {string} externalId
 * @returns {Promise<Candidate|null>}
 */
export async function fetchById(providerKey, externalId) {
    const { getProvider } = await import('./registry.js');
    const provider = getProvider(providerKey);
    if (!provider) throw new Error(`Unknown provider: ${providerKey}`);
    return provider.fetchById(externalId);
}