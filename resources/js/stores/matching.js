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
import {
    ensureMbArtist as engineEnsureMbArtist,
    searchLocalByClasses as engineSearchLocal,
} from '@factology/engine/external/matching.js';
import { getObject as engineGetObject, updateObject as engineUpdateObject } from '@factology/engine/localDb/index.js';
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

/**
 * Map an object's class to the MusicBrainz search type so autocomplete
 * searches the right entity (song vs artist vs album).
 * @param {object} thing
 * @returns {string|undefined} 'song', 'album', or undefined (=artist)
 */
function inferSearchType(thing) {
    const classIds = thing.classIds
        || (thing.classes && thing.classes.map(c => c.thing_id || c.id))
        || [];
    if (classIds.some((id) => id === UUID.SONG_CLASS)) return 'song';
    if (classIds.some((id) => id === UUID.MUSIC_BAND || id === UUID.MUSICIAN)) return 'artist';
    return undefined;
}

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
                // Determine search type from the object's class so the provider
                // searches the right MB entity (songs vs artists vs albums)
                const ctxType = inferSearchType(thing);
                const ctx = {
                    description: thing.description,
                    artist: thing.data?.artist || '',
                    data: thing.data,
                };
                if (ctxType) ctx.type = ctxType;

                const candidates = await searchProvider(MB_CLASS_IDS, thing.name, ctx);

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

            let lastError = null;

            const songs = await searchSongs(query, ctx).catch((e) => {
                console.error('[matchingStore] song search failed:', e);
                lastError = e;
                return [];
            });
            const artists = await searchArtists(query, ctx).catch((e) => {
                console.error('[matchingStore] artist search failed:', e);
                lastError = e;
                return [];
            });
            const albums = await searchAlbums(query, ctx).catch((e) => {
                console.error('[matchingStore] album search failed:', e);
                lastError = e;
                return [];
            });

            // If all three failed, propagate the error so the dialog can show
            // a useful message (e.g. "MusicBrainz blocked — turn on VPN")
            if (!songs.length && !artists.length && !albums.length && lastError) {
                throw lastError;
            }

            return { songs, artists, albums };
        },

        /**
         * Search for MusicBrainz artists matching a query in the local DB.
         * Queries objects linked to MUSIC_BAND or MUSICIAN classes.
         * @param {string} query — name substring to search
         * @param {number} [limit=20]
         * @returns {Promise<object[]>}
         */
        async searchLocalArtists(query, limit = 20) {
            const artistClassIds = [UUID.MUSIC_BAND, UUID.MUSICIAN];
            return await engineSearchLocal(artistClassIds, query, limit);
        },

        /**
         * Browse albums (release-groups) for a known MusicBrainz artist.
         * Returns Candidate objects for the MatchDialog album results section.
         * @param {string} artistMbid — MBID of the artist
         * @returns {Promise<import('@factology/engine/external/types').Candidate[]>}
         */
        async browseArtistAlbums(artistMbid) {
            const { browseArtistGroups } =
                await import('@factology/engine/external/providers/musicbrainz.js');
            const groups = await browseArtistGroups(artistMbid);
            const results = groups.map((a) => ({
                providerKey: 'musicbrainz',
                externalId: a.mbid,
                name: a.name,
                disambiguation: a.disambiguation || '',
                matchQuality: 0.5,
                type: 'Album',
                year: a.year || '',
                payload: a,
            }));
            console.log('browseArtistAlbums debug:', JSON.stringify(results.slice(0, 3).map(r => ({name: r.name, year: r.year, hasPayload: !!r.payload}))));
            return results;
        },

        /**
         * Search MusicBrainz for an artist's earliest official albums,
         * deduplicated by title. Used to populate the album datalist in
         * the MatchDialog so the user can narrow song search to a specific
         * album (which triggers the release-browse path in searchSongs).
         * @param {string} artistName — name to search MB for
         * @returns {Promise<{mbid: string, title: string, year: string}[]>}
         */
        async searchArtistAlbums(artistName) {
            const { searchArtists, browseArtistGroups } =
                await import('@factology/engine/external/providers/musicbrainz.js');
            const candidates = await searchArtists(artistName, { limit: 3 });
            const best = candidates[0];
            if (!best?.externalId) return [];
            const albums = await browseArtistGroups(best.externalId);
            // Deduplicate by title — keep the earliest album per title
            const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
            const seen = new Set();
            return albums.filter((a) => {
                const key = norm(a.name);
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            }).map((a) => ({ mbid: a.mbid, title: a.name, year: a.year }));
        },

        /**
         * Ensure a MusicBrainz artist exists locally (create if missing).
         * Attempts server-side creation first; falls back to local DB in
         * standalone/offline mode.
         * @param {import('@factology/engine/external/types').Candidate} candidate
         * @returns {Promise<{object: object, created: boolean}>}
         */
        async ensureMbArtist(candidate) {
            try {
                // Server mode: create via API
                const classId = candidate.type === 'Group'
                    ? UUID.MUSIC_BAND
                    : UUID.MUSICIAN;
                const payload = {
                    thing_id: candidate.externalId,
                    name: candidate.name,
                    type: UUID.G_THING,
                    owner: UUID.MUSICBRAINZ_OWNER,
                    data: {
                        mbid: candidate.externalId,
                        source: 'musicbrainz',
                        disambiguation: candidate.disambiguation || '',
                    },
                    classes: [{
                        one_thing_id: candidate.externalId,
                        link_type_id: UUID.LINK_TO_CLASS,
                        other_thing_id: classId,
                    }],
                };
                // Check if already exists on server
                const existingRes = await axios.get(`/object/${candidate.externalId}`);
                const existing = existingRes.data.data || existingRes.data;
                if (existing && existing.thing_id) {
                    return { object: existing, created: false };
                }
                await axios.post('/object', payload);
                return { object: payload, created: true };
            } catch (err) {
                // If 404 (not exists on server), we still try creating it
                if (err.response?.status === 404) {
                    try {
                        await axios.post('/object', {
                            thing_id: candidate.externalId,
                            name: candidate.name,
                            type: UUID.G_THING,
                            owner: UUID.MUSICBRAINZ_OWNER,
                            data: {
                                mbid: candidate.externalId,
                                source: 'musicbrainz',
                                disambiguation: candidate.disambiguation || '',
                            },
                            classes: [{
                                one_thing_id: candidate.externalId,
                                link_type_id: UUID.LINK_TO_CLASS,
                                other_thing_id: candidate.type === 'Group'
                                    ? UUID.MUSIC_BAND
                                    : UUID.MUSICIAN,
                            }],
                        });
                        return { object: { thing_id: candidate.externalId, name: candidate.name }, created: true };
                    } catch (_) {
                        /* fall through to local */
                    }
                }
                // Offline/standalone fallback: use engine matching.js
                const entry = {
                    externalId: candidate.externalId,
                    name: candidate.name,
                    type: candidate.type,
                    disambiguation: candidate.disambiguation,
                };
                return await engineEnsureMbArtist(entry);
            }
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
         * In standalone mode, delegates to the engine matching functions.
         * In web mode, updates via the server API.
         * @param {string} songThingId
         * @param {import('@factology/engine/external/types').Candidate} candidate
         * @returns {Promise<string>} — the created artist's thing_id
         */
        async confirmArtist(songThingId, candidate) {
            const artistId = candidate.externalId;
            const artistName = candidate.name;

            try {
                // Try server mode first
                const songRes = await axios.get(`/object/${songThingId}`);
                const song = songRes.data.data || songRes.data;

                // Determine class: MusicBand if type is "Group", else Musician
                const classId = candidate.type === 'Group'
                    ? UUID.MUSIC_BAND
                    : UUID.MUSICIAN;

                // Create the MusicBrainz-owned artist thing
                const artistPayload = {
                    thing_id: artistId,
                    name: artistName,
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
                songData.artistName = artistName;
                songData.mbMatch = {
                    state: 'confirmed',
                    at: Date.now(),
                    externalId: candidate.externalId,
                    providerKey: 'musicbrainz',
                    name: artistName,
                    type: 'artist',
                };
                await axios.put(`/object/${songThingId}`, { ...song, data: songData });

                return artistId;
            } catch (err) {
                // Offline/standalone fallback: use engine matching
                const entry = {
                    externalId: candidate.externalId,
                    name: artistName,
                    type: candidate.type,
                    disambiguation: candidate.disambiguation,
                };
                const { object } = await engineEnsureMbArtist(entry);

                // Stamp artist reference on the song in local DB
                try {
                    const song = await engineGetObject(songThingId);
                    if (song) {
                        const songData = { ...(song.data || {}) };
                        songData.artistThingId = artistId;
                        songData.artistName = artistName;
                        await engineUpdateObject(songThingId, { data: songData });
                    }
                } catch (_) { /* best-effort stamping */ }

                return object.thing_id;
            }
        },

        /**
         * Confirm an album match: creates a MusicBrainz-owned album thing
         * and stamps the reference on the current song.
         * In standalone mode, delegates to the engine matching functions.
         * In web mode, updates via the server API.
         * @param {string} songThingId
         * @param {import('@factology/engine/external/types').Candidate} candidate
         * @returns {Promise<string>} — the created album's thing_id
         */
        async confirmAlbum(songThingId, candidate) {
            const albumId = candidate.externalId;

            try {
                // Try server mode first
                const res = await axios.get(`/object/${songThingId}`);
                const song = res.data.data || res.data;

                // Create a MusicBrainz-owned album thing
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
            } catch (err) {
                // Offline/standalone fallback: album reference is metadata only
                // (no dedicated Album class in the schema — album info lives on
                // the song's data.artistThingId/artistName/albumName, etc.)
                return albumId;
            }
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