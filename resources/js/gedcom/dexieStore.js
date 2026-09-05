// resources/js/gedcom/dexieStore.js
//
// Concrete Dexie-backed async data source for the GEDCOM importer
// (resources/js/gedcom/gedcomImporter.js). The importer is intentionally
// storage-agnostic — it talks only to the small interface exposed here
// (putThing / putLink / preloadImportedFrom / …) so the same import logic can
// run over the real local IndexedDB (offline app) or fake-indexeddb in tests.
//
// Local rows carry sync-metadata fields (_syncStatus/_localRevision/…) so the
// P5 offline /import/gedcom route can hand newly imported rows to the sync
// layer just like the rest of the app.

import { getDb } from '../localDb/index';
import { SYNC_STATUS } from '../constants/syncStatus';
import { UUID } from '../constants/uuid';

// Stamp local-only sync defaults onto any row that lacks them. Thing/object
// rows are keyed by thing_id in the `objects` store.
function withSyncDefaults(row) {
    const sync = {
        _syncStatus: SYNC_STATUS.LOCAL_ONLY,
        _localRevision: 0,
        _serverRevision: 0,
        _serverId: null,
    };
    return { ...sync, ...row };
}

// Link rows in the `links` store are keyed by link_id (`link-<uuid>`).
function mintLinkId() {
    return 'link-' + cryptoUUID();
}

function cryptoUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // jsdom/old Node fallback (globals:true tests may lack WebCrypto).
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Build a concrete Dexie store bound to the (singleton) local database.
 * @returns {object} importer-facing data source
 */
export function createDexieStore() {
    return {
        db: getDb(),

        /**
         * Preload existing IMPORTED_FROM links for a GEDCOM source thing.
         * @param {string} sourceThingId
         * @returns {Promise<Map<string,string>>} source_external_id → thing_id
         */
        async preloadImportedFrom(sourceThingId) {
            const db = this.db;
            const links = await db.links
                .where('link_type_id')
                .equals(UUID.IMPORTED_FROM)
                .toArray();
            const map = new Map();
            for (const link of links) {
                if (link.other_thing_id !== sourceThingId) continue;
                if (link.data == null) continue;
                const d = typeof link.data === 'string' ? safeParse(link.data) : link.data;
                if (d && typeof d.source_external_id === 'string') {
                    map.set(d.source_external_id, link.one_thing_id);
                }
            }
            return map;
        },

        /**
         * Reuse an existing public place by its exact name (Place reuse: the
         * place object typically precedes imports, so it is shared, not copied).
         * Ignores class-definition rows (type === UUID.G_CLASS).
         * @param {string} name
         * @returns {Promise<string|null>}
         */
        async publicThingIdByName(name) {
            const db = this.db;
            const trimmed = String(name ?? '').trim();
            const hits = await db.objects
                .filter((o) => o.name === trimmed && !!o.public && o.type !== UUID.G_CLASS)
                .limit(1)
                .toArray();
            return hits.length ? hits[0].thing_id : null;
        },

        /**
         * Find a bibliographic source previously created under this owner with
         * the same normalized title key (cross-file/record dedupe).
         * @param {string} ownerId
         * @param {string} sourceKey
         * @returns {Promise<string|null>}
         */
        async sourceIdByKey(ownerId, sourceKey) {
            const db = this.db;
            const hits = await db.objects
                .filter((o) => o.owner === ownerId && o.type === UUID.G_THING
                    && o.data && o.data.properties
                    && o.data.properties.source_key === sourceKey)
                .limit(1)
                .toArray();
            return hits.length ? hits[0].thing_id : null;
        },

        /**
         * True when an identical (one,type,other) link row already exists.
         * Guards idempotent link creation on re-import.
         */
        async linkExists(one, type, other) {
            const db = this.db;
            const hits = await db.links.where('[one_thing_id+link_type_id+other_thing_id]')
                .equals([one, type, other])
                .toArray();
            return hits.length > 0;
        },

        /**
         * True when an UNDIRECTED link exists between a and b for any listed
         * type — used for MARRIED_TO and EVIDENCE edges whose orientation may
         * flip between passes/files.
         * @param {string} a
         * @param {string} b
         * @param {string[]} types
         */
        async pairLinkExists(a, b, types) {
            const db = this.db;
            const links = await db.links.toArray();
            return links.some((l) =>
                types.includes(l.link_type_id)
                && ((l.one_thing_id === a && l.other_thing_id === b)
                    || (l.one_thing_id === b && l.other_thing_id === a)));
        },

        /**
         * Resolve a thing_id back to its stored display name.
         * @param {string} thingId
         * @returns {Promise<string|null>}
         */
        async thingName(thingId) {
            const obj = await this.db.objects.get(thingId);
            return (obj && obj.name != null) ? String(obj.name) : null;
        },

        /**
         * Persist a thing/object row. thing_id is the primary key.
         * @param {object} row
         */
        async putThing(row) {
            await this.db.objects.put(withSyncDefaults(row));
        },

        /**
         * Persist a link row (stamps link_id when absent).
         * @param {object} row
         */
        async putLink(row) {
            await this.db.links.put(withSyncDefaults({
                link_id: row.link_id || mintLinkId(),
                link_uuid: row.link_uuid || null,
                ...row,
            }));
        },

        /**
         * Persist many external-link rows at once (URLs of a source/citation).
         * @param {Array<object>} rows
         */
        async bulkPutExternalLinks(rows) {
            await this.db.external_links.bulkPut(rows.map((r) => withSyncDefaults({
                id: r.id || cryptoUUID(),
                ...r,
            })));
        },
    };
}

function safeParse(str) {
    try {
        return JSON.parse(str);
    } catch {
        return {};
    }
}
