// resources/js/localDb/index.js

import { createDatabase } from './schema';
import { SYNC_STATUS, CHANGE_OP } from '../constants/syncStatus';

let _db = null;

/**
 * Get or create the singleton Dexie database instance.
 * @returns {Dexie}
 */
export function getDb() {
    if (!_db) {
        _db = createDatabase();
    }
    return _db;
}

/**
 * Create a new object in the local database.
 *
 * @param {object} data - Full object record (thing_id required)
 * @param {object} [opts]
 * @param {string} [opts.serverId] - Server this record belongs to
 * @param {boolean} [opts.skipChangeLog] - Don't enqueue a pending change
 * @returns {Promise<string>} thing_id
 */
export async function createObject(data, opts = {}) {
    const db = getDb();
    const now = Date.now();

    const record = {
        ...data,
        _syncStatus: opts.serverId ? SYNC_STATUS.LOCAL : SYNC_STATUS.LOCAL_ONLY,
        _localRevision: 1,
        _serverRevision: 0,
        _serverId: opts.serverId || null,
        _createdAt: now,
        _updatedAt: now,
    };

    await db.objects.put(record);

    if (!opts.skipChangeLog) {
        await enqueueChange({
            operation: CHANGE_OP.INSERT,
            table: 'objects',
            recordId: data.thing_id,
            payload: data,
            serverId: opts.serverId || null,
        });
    }

    return data.thing_id;
}

/**
 * Update an existing object in the local database.
 *
 * @param {string} thingId
 * @param {object} changes - Partial fields to update
 * @param {object} [opts]
 * @returns {Promise<void>}
 */
export async function updateObject(thingId, changes, opts = {}) {
    const db = getDb();
    const existing = await db.objects.get(thingId);

    if (!existing) {
        throw new Error(`Object not found in local DB: ${thingId}`);
    }

    const now = Date.now();

    // Apply field-level diff so we can log only changed fields
    const updated = {
        ...existing,
        ...changes,
        // Only auto-bump _localRevision if caller didn't set it explicitly
        _localRevision: changes._localRevision !== undefined
            ? changes._localRevision
            : (existing._localRevision || 0) + 1,
        _updatedAt: now,
    };

    // If record was synced, mark it local (dirty)
    if (existing._syncStatus === SYNC_STATUS.SYNCED || existing._syncStatus === SYNC_STATUS.SERVER_ONLY) {
        updated._syncStatus = SYNC_STATUS.LOCAL;
    }

    await db.objects.put(updated);

    if (!opts.skipChangeLog) {
        await enqueueChange({
            operation: CHANGE_OP.UPDATE,
            table: 'objects',
            recordId: thingId,
            payload: changes,
            serverId: opts.serverId || existing._serverId || null,
        });
    }
}

/**
 * Soft-delete an object (marks deleted=true).
 *
 * @param {string} thingId
 * @param {object} [opts]
 * @returns {Promise<void>}
 */
export async function deleteObject(thingId, opts = {}) {
    const db = getDb();
    const existing = await db.objects.get(thingId);

    if (!existing) return;

    // Soft delete: mark deleted=true so we can still sync the deletion
    await db.objects.update(thingId, {
        deleted: 1,
        _syncStatus: SYNC_STATUS.LOCAL,
        _localRevision: (existing._localRevision || 0) + 1,
        _updatedAt: Date.now(),
    });

    if (!opts.skipChangeLog) {
        await enqueueChange({
            operation: CHANGE_OP.DELETE,
            table: 'objects',
            recordId: thingId,
            payload: null,
            serverId: opts.serverId || existing._serverId || null,
        });
    }
}

/**
 * Hard-delete an object from the local DB (e.g., after sync confirms deletion).
 *
 * @param {string} thingId
 * @returns {Promise<void>}
 */
export async function hardDeleteObject(thingId) {
    const db = getDb();
    await db.objects.delete(thingId);
}

/**
 * Get a single object by thing_id.
 *
 * @param {string} thingId
 * @returns {Promise<object|null>}
 */
export async function getObject(thingId) {
    const db = getDb();
    const result = await db.objects.get(thingId);
    return result ?? null;
}

/**
 * List objects with optional filters.
 *
 * @param {object} [filters]
 * @param {number} [filters.type]
 * @param {boolean} [filters.includeDeleted]
 * @param {string} [filters.syncStatus]
 * @param {number} [filters.limit]
 * @returns {Promise<Array>}
 */
export async function listObjects(filters = {}) {
    const db = getDb();
    let query = db.objects.toCollection();

    // Use Dexie .filter() for complex conditions
    query = query.filter(obj => {
        if (obj.deleted && !filters.includeDeleted) return false;
        if (filters.type !== undefined) {
            const typeFilter = Array.isArray(filters.type) ? filters.type : [filters.type];
            if (!typeFilter.includes(obj.type)) return false;
        }
        if (filters.syncStatus && obj._syncStatus !== filters.syncStatus) return false;
        return true;
    });

    const results = await query.toArray();

    if (filters.limit && filters.limit > 0) {
        return results.slice(0, filters.limit);
    }

    return results;
}

/**
 * Search objects by name or description (case-insensitive).
 *
 * @param {string} searchTerm
 * @param {object} [filters]
 * @returns {Promise<Array>}
 */
export async function searchObjects(searchTerm, filters = {}) {
    const results = await listObjects(filters);
    if (!searchTerm?.trim()) return results;

    const term = searchTerm.toLowerCase();
    return results.filter(obj =>
        (obj.name && obj.name.toLowerCase().includes(term)) ||
        (obj.description && obj.description.toLowerCase().includes(term))
    );
}

/**
 * Enqueue a change for later sync.
 *
 * @param {object} change
 * @param {string} change.operation - INSERT, UPDATE, or DELETE
 * @param {string} change.table - objects/links/media
 * @param {string} change.recordId
 * @param {object|null} change.payload
 * @param {string|null} change.serverId
 * @returns {Promise<number>} id of the enqueued change
 */
export async function enqueueChange(change) {
    const db = getDb();
    return db.pendingChanges.add({
        ...change,
        timestamp: Date.now(),
    });
}

/**
 * Pop pending changes from the queue.
 *
 * @param {string} [serverId] - Filter by server
 * @param {number} [limit]
 * @returns {Promise<Array>}
 */
export async function popPendingChanges(serverId = null, limit = 100) {
    const db = getDb();
    let query = db.pendingChanges.orderBy('id');

    const results = [];
    if (serverId) {
        query = query.filter(c => c.serverId === serverId);
    }

    const collection = await query.limit(limit).toArray();

    // Delete them from the queue
    const ids = collection.map(c => c.id);
    if (ids.length > 0) {
        await db.pendingChanges.bulkDelete(ids);
    }

    return collection;
}

/**
 * Get count of pending changes.
 *
 * @param {string} [serverId]
 * @returns {Promise<number>}
 */
export async function getPendingCount(serverId = null) {
    const db = getDb();
    let collection = db.pendingChanges.toCollection();
    if (serverId) {
        collection = collection.filter(c => c.serverId === serverId);
    }
    return collection.count();
}

/**
 * Update sync metadata for a server.
 *
 * @param {string} serverId
 * @param {'pull'|'push'} type
 * @param {number} timestamp
 */
export async function updateSyncMetadata(serverId, type, timestamp) {
    const db = getDb();
    const existing = await db.syncMetadata.get(serverId) || { serverId };

    if (type === 'pull') {
        existing.lastPullTimestamp = timestamp;
    } else {
        existing.lastPushTimestamp = timestamp;
    }

    await db.syncMetadata.put(existing);
}

/**
 * Get sync metadata for a server.
 *
 * @param {string} serverId
 * @returns {Promise<object|null>}
 */
export async function getSyncMetadata(serverId) {
    const db = getDb();
    const result = await db.syncMetadata.get(serverId);
    return result ?? null;
}

/**
 * Clear all data in the local database (for testing/reset).
 */
export async function clearAll() {
    const db = getDb();
    await db.objects.clear();
    await db.links.clear();
    await db.media.clear();
    await db.pendingChanges.clear();
    await db.syncMetadata.clear();
}

export { SYNC_STATUS, CHANGE_OP };
