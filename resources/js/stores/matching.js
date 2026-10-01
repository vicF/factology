// resources/js/stores/matching.js
//
// Pinia store for MusicBrainz matching: auto-match, cache results,
// confirm/reject, manual search.
//
// Uses @factology/engine external matching functions.

import { defineStore } from 'pinia';
import { useAuthStore } from './auth';
import axios from 'axios';
import { searchProvider, fetchById } from '@factology/engine/external/search.js';
import { confirmMatch as engineConfirm, rejectMatch as engineReject, getMatchState } from '@factology/engine/external/matcher.js';
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
         * Handles both the local Dexie format (thing.classIds) and
         * the server API format (thing.classes — array of class objects).
         * @param {object} thing
         * @returns {boolean}
         */
        isEligible: () => (thing) => {
            if (!thing) return false;
            const classIds = thing.classIds
                || (thing.classes && thing.classes.map(c => c.thing_id || c.id))
                || [];
            return classIds.some((id) => MB_CLASS_IDS.includes(id));
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
            const candidates = await searchProvider(MB_CLASS_IDS, query, ctx);
            if (candidates && candidates.length > 0) {
                this.resultsCache.set(thingId, candidates);
            }
            return candidates || [];
        },

        /**
         * Manual search for all 3 categories (songs, artists, albums).
         * Calls each search type directly instead of going through the provider
         * search() dispatcher, so we get separate categorized results.
         * @param {string} query
         * @param {object} [ctx]
         * @returns {Promise<{ songs: Candidate[], artists: Candidate[], albums: Candidate[] }>}
         */
        async manualSearchAll(query, ctx = {}) {
            const { searchSongs, searchArtists, searchAlbums } =
                await import('@factology/engine/external/providers/musicbrainz.js');

            const [songs, artists, albums] = await Promise.all([
                searchSongs(query, ctx).catch((e) => {
                    console.error('[matchingStore] song search failed:', e);
                    return [];
                }),
                searchArtists(query, ctx).catch((e) => {
                    console.error('[matchingStore] artist search failed:', e);
                    return [];
                }),
                searchAlbums(query, ctx).catch((e) => {
                    console.error('[matchingStore] album search failed:', e);
                    return [];
                }),
            ]);

            return { songs, artists, albums };
        },

        /**
         * Confirm a match and promote the object.
         * In standalone mode, delegates to the engine matcher with local DB.
         * In web mode, updates via the server API.
         * @param {string} thingId
         * @param {import('@factology/engine/external/types').Candidate} candidate
         */
        async confirm(thingId, candidate) {
            try {
                // Try engine matcher first (standalone/local mode)
                await engineConfirm(thingId, candidate);
            } catch (err) {
                if (err.message !== 'Matcher not initialized — call initMatcher first') {
                    throw err;
                }
                // Web mode: update via server API
                const res = await axios.get(`/object/${thingId}`);
                const obj = res.data.data || res.data;
                const data = { ...(obj.data || {}) };
                data.mbMatch = {
                    state: 'confirmed',
                    at: Date.now(),
                    externalId: candidate.externalId,
                    providerKey: candidate.providerKey,
                    name: candidate.name,
                };
                await axios.put(`/object/${thingId}`, { ...obj, data });
            }
            this.resultsCache.delete(thingId);
        },

        /**
         * Confirm an artist match: creates a MusicBrainz-owned artist thing
         * and stamps the reference on the current song.
         * @param {string} songThingId
         * @param {import('@factology/engine/external/types').Candidate} candidate
         * @returns {Promise<string>} — the created artist's thing_id
         */
        async confirmArtist(songThingId, candidate) {
            const res = await axios.get(`/object/${songThingId}`);
            const song = res.data.data || res.data;

            // Determine class: MusicBand if type is "Group", else Musician
            const classId = candidate.type === 'Group'
                ? UUID.MUSIC_BAND
                : UUID.MUSICIAN;

            // Generate a version-4 UUID for the new artist thing if none provided
            const artistId = candidate.externalId;

            // Create the MusicBrainz-owned artist thing
            const artistPayload = {
                thing_id: artistId,
                name: candidate.name,
                type: UUID.G_THING,
                owner: UUID.MUSICBRAINZ_OWNER,
                data: {
                    mbid: candidate.externalId,
                    source: 'musicbrainz',
                    disambiguation: candidate.disambiguation || '',
                },
                classes: [{
                    one_thing_id: artistId,
                    link_type_id: UUID.LINK_TO_CLASS,
                    other_thing_id: classId,
                }],
            };

            await axios.post('/object', artistPayload);

            // Update the song with the artist reference
            const songData = { ...(song.data || {}) };
            songData.artistThingId = artistId;
            songData.artistName = candidate.name;
            songData.mbMatch = {
                state: 'confirmed',
                at: Date.now(),
                externalId: candidate.externalId,
                providerKey: 'musicbrainz',
                name: candidate.name,
                type: 'artist',
            };
            await axios.put(`/object/${songThingId}`, { ...song, data: songData });

            return artistId;
        },

        /**
         * Confirm an album match: creates a MusicBrainz-owned album thing
         * and stamps the reference on the current song.
         * @param {string} songThingId
         * @param {import('@factology/engine/external/types').Candidate} candidate
         * @returns {Promise<string>} — the created album's thing_id
         */
        async confirmAlbum(songThingId, candidate) {
            const res = await axios.get(`/object/${songThingId}`);
            const song = res.data.data || res.data;

            const albumId = candidate.externalId;

            // Create a MusicBrainz-owned album thing (type=G_THING, class=SongClass
            // since we don't have a dedicated Album class — it's essentially a container)
            const albumPayload = {
                thing_id: albumId,
                name: candidate.name,
                type: UUID.G_THING,
                owner: UUID.MUSICBRAINZ_OWNER,
                data: {
                    mbid: candidate.externalId,
                    source: 'musicbrainz',
                    disambiguation: candidate.disambiguation || '',
                    albumArtist: candidate.artist || '',
                    albumYear: candidate.year || '',
                },
            };

            await axios.post('/object', albumPayload);

            // Update the song with album reference
            const songData = { ...(song.data || {}) };
            songData.albumThingId = albumId;
            songData.albumName = candidate.name;
            songData.albumYear = candidate.year || '';
            songData.mbMatch = {
                state: 'confirmed',
                at: Date.now(),
                externalId: candidate.externalId,
                providerKey: 'musicbrainz',
                name: candidate.name,
                type: 'album',
            };
            await axios.put(`/object/${songThingId}`, { ...song, data: songData });

            return albumId;
        },

        /**
         * Reject all matches (user says no match exists).
         * In standalone mode, delegates to the engine matcher with local DB.
         * In web mode, updates via the server API.
         * @param {string} thingId
         */
        async reject(thingId) {
            try {
                // Try engine matcher first (standalone/local mode)
                await engineReject(thingId);
            } catch (err) {
                if (err.message !== 'Matcher not initialized — call initMatcher first') {
                    throw err;
                }
                // Web mode: update via server API
                const res = await axios.get(`/object/${thingId}`);
                const obj = res.data.data || res.data;
                const data = { ...(obj.data || {}) };
                data.mbMatch = {
                    state: 'rejected',
                    at: Date.now(),
                };
                await axios.put(`/object/${thingId}`, { ...obj, data });
            }
            this.resultsCache.delete(thingId);
        },
    },
});