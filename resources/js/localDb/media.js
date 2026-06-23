// resources/js/localDb/media.js

import { getDb, enqueueChange } from './index';
import { SYNC_STATUS, CHANGE_OP } from '../constants/syncStatus';

/**
 * Save media metadata (insert or update).
 *
 * @param {object} media - Full media record (thing_id required)
 * @param {object} [opts]
 * @returns {Promise<string>} thing_id
 */
export async function saveMedia(media, opts = {}) {
    const db = getDb();
    const existing = await db.media.get(media.thing_id);

    const record = {
        ...media,
        _syncStatus: existing && existing._syncStatus === SYNC_STATUS.SYNCED
            ? SYNC_STATUS.LOCAL
            : (opts.serverId ? SYNC_STATUS.LOCAL : SYNC_STATUS.LOCAL_ONLY),
        _localRevision: (existing?._localRevision || 0) + 1,
        _serverRevision: existing?._serverRevision || 0,
        _serverId: opts.serverId || existing?._serverId || null,
        _updatedAt: Date.now(),
    };

    await db.media.put(record);

    const operation = existing ? CHANGE_OP.UPDATE : CHANGE_OP.INSERT;
    if (!opts.skipChangeLog) {
        await enqueueChange({
            operation,
            table: 'media',
            recordId: media.thing_id,
            payload: media,
            serverId: record._serverId,
        });
    }

    return media.thing_id;
}

/**
 * Get media metadata by thing_id.
 *
 * @param {string} thingId
 * @returns {Promise<object|null>}
 */
export async function getMedia(thingId) {
    const db = getDb();
    const result = await db.media.get(thingId);
    return result ?? null;
}

/**
 * Delete media metadata.
 *
 * @param {string} thingId
 * @param {object} [opts]
 * @returns {Promise<void>}
 */
export async function deleteMedia(thingId, opts = {}) {
    const db = getDb();
    const existing = await db.media.get(thingId);
    if (!existing) return;

    await db.media.delete(thingId);

    if (!opts.skipChangeLog) {
        await enqueueChange({
            operation: CHANGE_OP.DELETE,
            table: 'media',
            recordId: thingId,
            payload: null,
            serverId: opts.serverId || existing._serverId || null,
        });
    }
}

/**
 * List media with optional filters.
 *
 * @param {object} [filters]
 * @param {string} [filters.folderId]
 * @param {string} [filters.crc]
 * @returns {Promise<Array>}
 */
export async function listMedia(filters = {}) {
    const db = getDb();
    let collection = db.media.toCollection();

    collection = collection.filter(m => {
        if (filters.folderId && m.folder_id !== filters.folderId) return false;
        if (filters.crc && m.crc !== filters.crc) return false;
        return true;
    });

    return collection.toArray();
}
