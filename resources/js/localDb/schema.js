// resources/js/localDb/schema.js

import Dexie from 'dexie';

const DB_NAME = 'factology_local';
const DB_VERSION = 1;

/**
 * Define the local IndexedDB schema via Dexie.
 *
 * Stores mirror server tables with extra sync-tracking fields:
 *  - _syncStatus:  one of SYNC_STATUS values
 *  - _localRevision: integer, bumped on every local write
 *  - _serverRevision: integer, last known server revision after successful sync
 *  - _serverId: UUID of the server this record belongs to (null = local-only)
 */
export function createDatabase() {
    const db = new Dexie(DB_NAME);

    db.version(DB_VERSION).stores({
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
    });

    return db;
}
