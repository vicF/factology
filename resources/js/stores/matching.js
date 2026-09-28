// resources/js/stores/matching.js
//
// Pinia store for MusicBrainz matching: auto-match, cache results,
// confirm/reject, manual search.
//
// Uses @factology/engine external matching functions.

import { defineStore } from 'pinia';
import { useAuthStore } from './auth';
import { searchProvider, fetchById } from '@factology/engine/external/search.js';
import { confirmMatch, rejectMatch, getMatchState } from '@factology/engine/external/matcher.js';
import { UUID } from '@factology/engine/constants/uuid.js';

/** Class IDs that MusicBrainz can handle */
const MB_CLASS_IDS = [
    UUID.MUSIC_BAND,
    UUID.MUSICIAN,
    UUID.SONG_CLASS,
    UUID.REPERTOIRE_CLASS,
    UUID.PRACTICE_LIST_CLASS,
];

/** Provider key we're interested in */
const MB_PROVIDER_KEY = 'musicbrainz';

export const useMatchingStore = defineStore('matching', {
    state: () => ({
        /** @type {Map<string, import('@factology/engine/external/types').Candidate[]>} */
        resultsCache: new Map(),
        /** @type {Set<string>} thingIds currently being matched */
        matching: new Set(),
    }),

    getters: {
        /**
         * Get match state for an object.
         * @param {object} thing
         * @returns {import('@factology/engine/external/types').MatchState}
         */
        matchState: () => (thing) => {
            return getMatchState(thing);
        },

        /**
         * Check if a thing class is eligible for MusicBrainz matching.
         * @param {object} thing
         * @returns {boolean}
         */
        isEligible: () => (thing) => {
            if (!thing || !thing.classIds) return false;
            return thing.classIds.some((id) => MB_CLASS_IDS.includes(id));
        },

        /**
         * Get cached results for a thing.
         * @param {string} thingId
         * @returns {import('@factology/engine/external/types').Candidate[]|null}
         */
        getCached: (state) => (thingId) => {
            return state.resultsCache.get(thingId) || null;
        },

        /** Check if a thing is currently being matched */
        isMatching: (state) => (thingId) => {
            return state.matching.has(thingId);
        },
    },

    actions: {
        /**
         * Auto-match a thing against MusicBrainz.
         * Called on object create/update for eligible classes.
         * @param {object} thing
         * @returns {Promise<void>}
         */
        async autoMatch(thing) {
            if (!thing || !thing.thing_id) return;
            if (!this.isEligible(thing)) return;
            if (this.matching.has(thing.thing_id)) return;

            const auth = useAuthStore();
            // Only match if authenticated (guest can't own objects)
            if (!auth.authenticated) return;

            this.matching.add(thing.thing_id);
            try {
                const candidates = await searchProvider(MB_CLASS_IDS, thing.name, {
                    description: thing.description,
                    artist: thing.data?.artist || '',
                    data: thing.data,
                });

                // Cache results
                if (candidates && candidates.length > 0) {
                    this.resultsCache.set(thing.thing_id, candidates);
                }
            } catch (err) {
                console.error(`[matchingStore] autoMatch failed for ${thing.thing_id}:`, err);
            } finally {
                this.matching.delete(thing.thing_id);
            }
        },

        /**
         * Cache search results for later dialog use.
         * @param {string} thingId
         * @param {import('@factology/engine/external/types').Candidate[]} results
         */
        cacheResults(thingId, results) {
            this.resultsCache.set(thingId, results);
        },

        /**
         * Manual search against MusicBrainz.
         * @param {string} thingId
         * @param {string} query
         * @param {object} [ctx]
         * @returns {Promise<import('@factology/engine/external/types').Candidate[]>}
         */
        async manualSearch(thingId, query, ctx = {}) {
            try {
                const candidates = await searchProvider(MB_CLASS_IDS, query, ctx);
                if (candidates && candidates.length > 0) {
                    this.resultsCache.set(thingId, candidates);
                }
                return candidates || [];
            } catch (err) {
                console.error(`[matchingStore] manualSearch failed:`, err);
                return [];
            }
        },

        /**
         * Confirm a match and promote the object.
         * @param {string} thingId
         * @param {import('@factology/engine/external/types').Candidate} candidate
         */
        async confirm(thingId, candidate) {
            try {
                await confirmMatch(thingId, candidate);
                this.resultsCache.delete(thingId);
            } catch (err) {
                console.error(`[matchingStore] confirmMatch failed:`, err);
                throw err;
            }
        },

        /**
         * Reject all matches (user says no match exists).
         * @param {string} thingId
         */
        async reject(thingId) {
            try {
                await rejectMatch(thingId);
                this.resultsCache.delete(thingId);
            } catch (err) {
                console.error(`[matchingStore] rejectMatch failed:`, err);
                throw err;
            }
        },
    },
});