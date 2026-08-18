// resources/js/localDb/schemaMap.js

/**
 * Declarative coverage map: local Dexie store -> server (Postgres) tables it
 * mirrors and the server columns that MUST be covered by the local import/CRUD
 * layer.
 *
 * The drift test (tests-vitest/localDb/schemaDrift.test.js) asserts every
 * column Laravel migrations add to these mirrored tables is listed here. When a
 * new Postgres migration adds a column, the test fails until the column is
 * added here (and handled in the local store code).
 *
 * Local-only fields (_syncStatus, _serverId, _localRevision, tags,
 * _createdAt, _updatedAt, ...) are intentionally NOT listed — they are not
 * server columns.
 */
export const schemaMap = {
    objects: {
        importSource: 'things',
        serverTables: ['things'],
        columns: [
            'thing_id', 'name', 'type', 'description', 'start', 'end',
            'start_meta', 'end_meta',
            'record_created', 'record_updated',
            'owner', 'public', 'deleted', 'data', 'server_uuid', 'imported_at',
            'name_translations', 'description_translations', 'abstract',
        ],
    },

    links: {
        importSource: 'links',
        serverTables: ['links'],
        columns: [
            'link_id', 'translation', 'one_thing_id', 'link_type_id',
            'other_thing_id', 'public', 'link_start', 'link_end',
            'link_start_meta', 'link_end_meta',
            'link_uuid', 'deleted',
            'imported_at',
        ],
    },

    media: {
        importSource: 'photo_media',
        // The local media store MERGES photo_media + photo_files into one store.
        serverTables: ['photo_media', 'photo_files'],
        columns: [
            // photo_media
            'thing_id', 'filename', 'size', 'crc', 'exif_date', 'event_date',
            'latitude', 'longitude', 'media_deleted', 'exif', 'phash', 'sha256',
            // photo_files
            'id', 'media_thing_id', 'path', 'folder_id', 'last_seen',
            'file_deleted', 'file_thing_id', 'ctime',
        ],
    },
};
