// resources/js/localDb/wipe.js
//
// Remove one identity's rows from the local DB (used when an identity is
// removed from the device with "erase this identity's data").

import { getDb } from './index';

/**
 * Delete every object row owned by `ownerThingId` plus the links that touch
 * them (so nothing dangles). System/shared rows (SYSTEM_OWNER) are never
 * touched.
 *
 * @param {string} ownerThingId
 * @returns {Promise<{ deletedObjects: number, deletedLinks: number }>}
 */
export async function wipeOwnerRows(ownerThingId) {
    const db = getDb();

    const owned = await db.objects
        .where('owner')
        .equals(ownerThingId)
        .toArray();
    const removedIds = new Set(owned.map((o) => o.thing_id));
    if (removedIds.size === 0) {
        return { deletedObjects: 0, deletedLinks: 0 };
    }

    // Links whose one/other endpoint was owned → they die with the object.
    const allLinks = await db.links.toArray();
    const linkIdsToDelete = allLinks
        .filter((l) => removedIds.has(l.one_thing_id) || removedIds.has(l.other_thing_id))
        .map((l) => l.link_id);

    await db.objects.bulkDelete([...removedIds]);
    if (linkIdsToDelete.length > 0) {
        await db.links.bulkDelete(linkIdsToDelete);
    }

    return { deletedObjects: removedIds.size, deletedLinks: linkIdsToDelete.length };
}
