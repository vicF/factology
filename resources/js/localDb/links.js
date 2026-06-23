// resources/js/localDb/links.js

import { getDb, enqueueChange } from './index';
import { SYNC_STATUS, CHANGE_OP } from '../constants/syncStatus';

/**
 * Save a link (insert or update).
 *
 * @param {object} link - Full link record (link_id required)
 * @param {object} [opts]
 * @returns {Promise<string>} link_id
 */
export async function saveLink(link, opts = {}) {
    const db = getDb();
    const existing = await db.links.get(link.link_id);

    const record = {
        ...link,
        _syncStatus: existing && existing._syncStatus === SYNC_STATUS.SYNCED
            ? SYNC_STATUS.LOCAL
            : (opts.serverId ? SYNC_STATUS.LOCAL : SYNC_STATUS.LOCAL_ONLY),
        _localRevision: (existing?._localRevision || 0) + 1,
        _serverRevision: existing?._serverRevision || 0,
        _serverId: opts.serverId || existing?._serverId || null,
        _updatedAt: Date.now(),
    };

    await db.links.put(record);

    const operation = existing ? CHANGE_OP.UPDATE : CHANGE_OP.INSERT;
    if (!opts.skipChangeLog) {
        await enqueueChange({
            operation,
            table: 'links',
            recordId: link.link_id,
            payload: link,
            serverId: record._serverId,
        });
    }

    return link.link_id;
}

/**
 * Delete a link by link_id.
 *
 * @param {string} linkId
 * @param {object} [opts]
 * @returns {Promise<void>}
 */
export async function deleteLink(linkId, opts = {}) {
    const db = getDb();
    const existing = await db.links.get(linkId);
    if (!existing) return;

    await db.links.delete(linkId);

    if (!opts.skipChangeLog) {
        await enqueueChange({
            operation: CHANGE_OP.DELETE,
            table: 'links',
            recordId: linkId,
            payload: null,
            serverId: opts.serverId || existing._serverId || null,
        });
    }
}

/**
 * Get a link by link_id.
 *
 * @param {string} linkId
 * @returns {Promise<object|null>}
 */
export async function getLink(linkId) {
    const db = getDb();
    const result = await db.links.get(linkId);
    return result ?? null;
}

/**
 * List links for a given thing (as one_thing_id or other_thing_id).
 *
 * @param {string} thingId
 * @returns {Promise<Array>}
 */
export async function listLinksForThing(thingId) {
    const db = getDb();
    return db.links
        .where('one_thing_id')
        .equals(thingId)
        .or('other_thing_id')
        .equals(thingId)
        .toArray();
}

/**
 * Replace all links for a thing (used during sync merge).
 *
 * @param {string} thingId
 * @param {Array} newLinks
 * @param {object} [opts]
 */
export async function replaceLinksForThing(thingId, newLinks, opts = {}) {
    const db = getDb();
    await db.transaction('rw', db.links, async () => {
        // Delete existing links
        const existing = await db.links
            .where('one_thing_id')
            .equals(thingId)
            .primaryKeys();
        await db.links.bulkDelete(existing);

        // Insert new links
        for (const link of newLinks) {
            await saveLink(link, { ...opts, skipChangeLog: true });
        }
    });
}
