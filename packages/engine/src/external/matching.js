// packages/engine/src/external/matching.js
//
// Shared matching workflow — create/ensure MB-owned artists/songs and search
// local objects by class. Used by both Factology (web+standalone) and SetTempo
// (standalone). Each app may wrap these with its own server-aware store.
//
// The operations here go directly against the local DB (Dexie/SQLite) and are
// sync-aware (enqueue pending changes). Server-mode apps call the server API
// first and fall back here in standalone/offline mode.

import { getObject, createObject, getDb } from '../localDb/index.js';
import { saveLink, newLinkId } from '../localDb/links.js';
import { UUID } from '../constants/uuid.js';

// ── Object shape helpers ──

const G_THING = 3;

/** Build a full thing record as createObject expects. */
function buildThing(opts) {
    return {
        thing_id: opts.thing_id,
        name: opts.name,
        description: opts.description || null,
        type: opts.type || G_THING,
        owner: opts.owner,
        public: opts.public !== undefined ? opts.public : 1,
        deleted: 0,
        start: null,
        end: null,
        data: opts.data || null,
    };
}

// ── MusicBrainz-owned artist ──

/**
 * Ensure a MusicBrainz artist exists in the local DB.
 * If the artist (keyed by MBID) already exists and is not deleted, returns it.
 * Otherwise creates the object + LINK_TO_CLASS link.
 *
 * @param {object} entry
 * @param {string} entry.externalId  — MBID (used as thing_id)
 * @param {string} entry.name        — display name
 * @param {string} [entry.type]      — 'Group' → MUSIC_BAND, else MUSICIAN
 * @param {string} [entry.disambiguation]
 * @returns {Promise<{object: object, created: boolean}>}
 */
export async function ensureMbArtist(entry) {
    const existing = await getObject(entry.externalId);
    if (existing && !existing.deleted) {
        return { object: existing, created: false };
    }

    const classId = entry.type === 'Group' ? UUID.MUSIC_BAND : UUID.MUSICIAN;
    const data = {
        mbid: entry.externalId,
        source: 'musicbrainz',
        disambiguation: entry.disambiguation || '',
    };

    await createObject(buildThing({
        thing_id: entry.externalId,
        name: entry.name,
        owner: UUID.MUSICBRAINZ_OWNER,
        data,
    }));

    await saveLink({
        link_id: newLinkId(),
        one_thing_id: entry.externalId,
        link_type_id: UUID.LINK_TO_CLASS,
        other_thing_id: classId,
        public: 1,
    });

    const object = await getObject(entry.externalId);
    return { object, created: true };
}

// ── MusicBrainz-owned song ──

/**
 * Ensure a MusicBrainz song (recording) exists in the local DB.
 *
 * @param {object} entry
 * @param {string} entry.externalId   — MBID (recording MBID)
 * @param {string} entry.name         — recording title
 * @param {string} [entry.disambiguation]
 * @param {string} [entry.album]
 * @param {string} [entry.albumYear]
 * @param {string} artistThingId      — MBID of the parent artist
 * @param {string} artistName         — display name of the artist
 * @returns {Promise<{object: object, created: boolean}>}
 */
export async function ensureMbSong(entry, artistThingId, artistName) {
    const existing = await getObject(entry.externalId);
    if (existing && !existing.deleted) {
        return { object: existing, created: false };
    }

    const data = {
        mbid: entry.externalId,
        mbidKind: 'recording',
        source: 'musicbrainz',
        disambiguation: entry.disambiguation || '',
    };
    if (artistThingId) {
        data.artistThingId = artistThingId;
        data.artistName = artistName || '';
    }
    if (entry.album) {
        data.album = entry.album;
        data.albumYear = entry.albumYear || '';
    }

    await createObject(buildThing({
        thing_id: entry.externalId,
        name: entry.name,
        owner: UUID.MUSICBRAINZ_OWNER,
        data,
    }));

    await saveLink({
        link_id: newLinkId(),
        one_thing_id: entry.externalId,
        link_type_id: UUID.LINK_TO_CLASS,
        other_thing_id: UUID.SONG_CLASS,
        public: 1,
    });

    const object = await getObject(entry.externalId);
    return { object, created: true };
}

// ── Local (user-owned) artist ──

/**
 * Create a local (user-owned) artist in the local DB.
 * Does NOT check for duplicates — callers should search first.
 *
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.classId   — MUSIC_BAND or MUSICIAN
 * @param {string} opts.owner     — the active identity thing_id
 * @param {string} [opts.thing_id]  — optional explicit UUID
 * @returns {Promise<object>} the created object
 */
export async function createLocalArtist({ name, classId, owner, thing_id }) {
    const tid = thing_id || crypto.randomUUID();

    await createObject(buildThing({
        thing_id: tid,
        name,
        owner,
        public: 0,
        data: { local: true },
    }));

    await saveLink({
        link_id: newLinkId(),
        one_thing_id: tid,
        link_type_id: UUID.LINK_TO_CLASS,
        other_thing_id: classId,
        public: 1,
    });

    return await getObject(tid);
}

// ── Local search by class ──

/**
 * Search non-deleted objects linked to any of the given class IDs, filtered
 * by name substring match. Operates on the local DB only.
 *
 * @param {string[]} classIds  — class UUIDs to look for
 * @param {string} [query]     — optional name substring filter
 * @param {number} [limit=50]  — max results
 * @returns {Promise<object[]>}
 */
export async function searchLocalByClasses(classIds, query = '', limit = 50) {
    const db = getDb();
    if (!classIds || classIds.length === 0) return [];

    const links = await db.links
        .where('[other_thing_id+link_type_id]')
        .anyOf(classIds.map((c) => [c, UUID.LINK_TO_CLASS]))
        .toArray();

    const ids = [...new Set(links.filter((l) => l.one_thing_id).map((l) => l.one_thing_id))];
    if (ids.length === 0) return [];

    const rows = await db.objects.bulkGet(ids);
    const q = query.trim().toLowerCase();

    return rows
        .filter((o) => o && !o.deleted && (!q || (o.name || '').toLowerCase().includes(q)))
        .slice(0, limit);
}