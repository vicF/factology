// packages/engine/src/localDb/migrateFromDexie.js
//
// One-time migration: copies user data from the old Dexie/IndexedDB database
// to the current SQLiteAdapter database.
//
// Background: the app previously used Dexie (backed by browser IndexedDB) for
// local storage. After switching to SQLiteAdapter (sql.js WASM + file), the
// old IndexedDB data becomes invisible — a fresh SQLite file is created with
// only seeded system objects.
//
// This module reads all rows from the old Dexie database and writes them to
// the SQLite database. It runs once (tracked by a sentinel in syncMetadata)
// and then deletes the old IndexedDB database.

import Dexie from 'dexie';
import { getDb } from './index.js';
import { DB_NAME } from './schema.js';

const MIGRATION_SENTINEL_KEY = '_migrated_from_dexie_v1';

const SCHEMA_V5 = {
    objects: '&thing_id, type, owner, public, deleted, start, end, _syncStatus, _serverId, *tags',
    links: '&link_id, link_uuid, one_thing_id, link_type_id, other_thing_id, public, [one_thing_id+link_type_id], [other_thing_id+link_type_id], [one_thing_id+link_type_id+other_thing_id], _syncStatus, _serverId',
    media: '&thing_id, filename, size, crc, folder_id, _syncStatus, _serverId',
    pendingChanges: '++id, operation, table, recordId, serverId, timestamp',
    syncMetadata: '&serverId, lastPullTimestamp, lastPushTimestamp',
    external_links: '&id, thing_id, url, _syncStatus, _serverId',
};

const STORES = ['objects', 'links', 'media', 'pendingChanges', 'syncMetadata', 'external_links'];

function isSQLiteBackend(db) {
    return typeof db._execPrepared === 'function';
}

export async function migrateFromDexie() {
    const db = getDb();
    if (!isSQLiteBackend(db)) return;

    try {
        const sentinel = await db.syncMetadata.get(MIGRATION_SENTINEL_KEY);
        if (sentinel) return;
    } catch {}

    const oldDb = await tryOpenDexie();
    if (!oldDb) return;

    const objectCount = await oldDb.objects.count();
    if (objectCount === 0) {
        oldDb.delete();
        return;
    }

    let totalMigrated = 0;
    for (const storeName of STORES) {
        if (!oldDb.tables.some(t => t.name === storeName)) continue;
        if (!db[storeName]) continue;

        const allRows = await oldDb[storeName].toArray();
        if (allRows.length === 0) continue;

        const cleanRows = allRows.map(row => {
            const cleaned = { ...row };
            if ('' in cleaned) delete cleaned[''];
            return cleaned;
        });

        try {
            await db[storeName].bulkPut(cleanRows);
            totalMigrated += cleanRows.length;
        } catch (e) {
            console.warn('[migrateFromDexie] Bulk write failed for "' + storeName + '", trying row-by-row:', e.message);
            for (const row of cleanRows) {
                try { await db[storeName].put(row); totalMigrated++; }
                catch (e2) { /* skip corrupt rows */ }
            }
        }
    }

    try {
        await db.syncMetadata.put({
            serverId: MIGRATION_SENTINEL_KEY,
            lastPullTimestamp: Date.now(),
            lastPushTimestamp: Date.now(),
        });
    } catch {}

    try { await oldDb.delete(); } catch {}
}

async function tryOpenDexie() {
    const exists = await Dexie.exists(DB_NAME);
    if (!exists) return null;

    const db = new Dexie(DB_NAME);

    db.version(1).stores({
        objects: '&thing_id, type, owner, public, deleted, start, end, _syncStatus, _serverId, *tags',
        links: '&link_id, one_thing_id, link_type_id, other_thing_id, public, [one_thing_id+link_type_id+other_thing_id], _syncStatus, _serverId',
        media: '&thing_id, filename, size, crc, folder_id, _syncStatus, _serverId',
        pendingChanges: '++id, operation, table, recordId, serverId, timestamp',
        syncMetadata: '&serverId, lastPullTimestamp, lastPushTimestamp',
    });
    db.version(2).stores(SCHEMA_V5);
    db.version(3).stores(SCHEMA_V5);
    db.version(4).stores(SCHEMA_V5);
    db.version(5).stores(SCHEMA_V5);

    await db.open();
    return db;
}
