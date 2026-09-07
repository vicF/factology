// packages/engine/src/localDb/schema.js

import Dexie from 'dexie';

export const DB_NAME = 'factology_local';
export const DB_VERSION = 3;

/**
 * Define the local IndexedDB schema via Dexie.
 *
 * Stores mirror server tables with extra sync-tracking fields:
 *  - _syncStatus:  one of SYNC_STATUS values
 *  - _localRevision: integer, bumped on every local write
 *  - _serverRevision: integer, last known server revision after successful sync
 *  - _serverId: UUID of the server this record belongs to (null = local-only)
 *
 * Schema migrations follow Dexie's version() chain. DB_VERSION is the ONLY
 * number to bump for a new migration; then add a new db.version(n) block in
 * createDatabase() below. Every version() must carry the full latest store
 * schema, and the upgrade() callback (optional) migrates existing data.
 */
const STORE_V1 = {
    // things table mirror
    objects: `
        &thing_id,
        type,
        owner,
        public,
        deleted,
        start,
        end,
        _syncStatus,
        _serverId,
        *tags
    `,

    // links table mirror
    links: `
        &link_id,
        one_thing_id,
        link_type_id,
        other_thing_id,
        public,
        [one_thing_id+link_type_id+other_thing_id],
        _syncStatus,
        _serverId
    `,

    // photo_media + photo_files merged for local use
    media: `
        &thing_id,
        filename,
        size,
        crc,
        folder_id,
        _syncStatus,
        _serverId
    `,

    // Queue of changes to push to server(s)
    // Fields: id (auto), operation, table, recordId, payload (JSON), serverId, timestamp
    pendingChanges: `
        ++id,
        operation,
        table,
        recordId,
        serverId,
        timestamp
    `,

    // Track last sync state per server
    syncMetadata: `
        &serverId,
        lastPullTimestamp,
        lastPushTimestamp
    `,
};

// v2: links gain a link_uuid index — the canonical, cross-instance link key
// used by the sync layer (matching and dedup). link_id stays the local PK.
const STORE_V2 = {
    ...STORE_V1,
    links: `
        &link_id,
        link_uuid,
        one_thing_id,
        link_type_id,
        other_thing_id,
        public,
        [one_thing_id+link_type_id+other_thing_id],
        _syncStatus,
        _serverId
    `,
};

// v3: `external_links` store — mirrors the server's external_links table
// (id uuid PK, thing_id, url) plus the usual sync columns, so offline
// source/URL links are first-class rows with schema parity.
const STORE_V3 = {
    ...STORE_V2,
    external_links: `
        &id,
        thing_id,
        url,
        _syncStatus,
        _serverId
    `,
};

export function createDatabase() {
    const db = new Dexie(DB_NAME);

    // Baseline schema.
    db.version(1).stores(STORE_V1);

    // v2: link_uuid index on links (see STORE_V2).
    db.version(2).stores(STORE_V2).upgrade(async (tx) => {
        // Nothing to migrate — the new index only needs re-created stores;
        // existing rows keep their link_id PKs and are indexed on link_uuid
        // as the value becomes available.
    });

    // v3: external_links store (see STORE_V3). No data migration required.
    db.version(3).stores(STORE_V3);

    return db;
}
