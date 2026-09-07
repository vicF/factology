// resources/js/localDb/legacyAdopt.js
//
// Adopt rows left over from the pre-identity era (owner 'local-user-thing' or
// a missing owner) onto the first identity that unlocks on this device, so
// that data created before identities existed does not "disappear" behind the
// owner-visibility filter.

import { getDb } from '@factology/engine/localDb/index.js';
import { BOOTSTRAP_THINGS, CLASSES } from '@factology/engine/localDb/seedData.js';

// Seed/system thing ids must never be adopted — they are re-owned to
// SYSTEM_OWNER by seeder.normalizeSystemOwners instead.
const SEED_IDS = new Set([
    ...BOOTSTRAP_THINGS.map((t) => t.thing_id),
    ...CLASSES.map((c) => c.thing_id),
]);

/**
 * Re-own anonymous legacy rows to an identity. Runs once, on the first unlock.
 * @param {string} ownerThingId - the identity adopting the rows
 * @returns {Promise<number>} number of rows adopted
 */
export async function adoptLegacyRows(ownerThingId) {
    const db = getDb();
    const rows = await db.objects
        .filter((o) =>
            !o.deleted
            && (o.owner === 'local-user-thing' || o.owner == null)
            && !SEED_IDS.has(o.thing_id))
        .toArray();
    if (rows.length === 0) return 0;
    for (const row of rows) {
        row.owner = ownerThingId;
    }
    await db.objects.bulkPut(rows);
    return rows.length;
}
