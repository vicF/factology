// packages/engine/src/external/types.js
//
// JSDoc type definitions for the external matching system.

/**
 * @typedef {object} ExternalProvider
 * @property {string} key       — Unique provider key (e.g. 'musicbrainz')
 * @property {string} name      — Human-readable name (e.g. 'MusicBrainz')
 * @property {string[]} classIds — Thing class UUIDs this provider can match
 * @property {(query: string, ctx: object) => Promise<Candidate[]>} search
 *     — Search for candidates matching the given query and context
 * @property {(id: string) => Promise<Candidate|null>} [fetchById]
 *     — Fetch a single candidate by its external ID
 * @property {(id: string) => string} [externalUrl]
 *     — Build a URL to view the record on the provider's website
 * @property {'uuid'|'opaque'} [idScheme='uuid']
 *     — How external IDs are structured
 */

/**
 * @typedef {object} Candidate
 * @property {string} providerKey    — Which provider returned this
 * @property {string} externalId     — Stable ID on the external system
 * @property {string} name           — Display name
 * @property {string} [disambiguation]  — Extra qualifier (MB disambiguation)
 * @property {number} [matchQuality]    — 0–1 confidence score
 * @property {string} [type]         — Type label (e.g. 'Artist', 'Song')
 * @property {string} [year]         — Year associated (release year, birth year)
 * @property {object} [payload]      — Raw data from the provider
 */

/**
 * @typedef {object} MatchState
 * @property {'none'|'error'|'pending'|'unmatched'|'rejected'|'searching'} state
 * @property {number} at           — Unix ms timestamp
 * @property {Candidate[]} [results]  — Cached search results
 * @property {number} [attempts]      — How many times we've tried
 * @property {string} [message]       — Error message if state='error'
 */

export default {};

// Trick to make these importable as types
export const __types = true;