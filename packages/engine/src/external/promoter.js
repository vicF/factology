// packages/engine/src/external/promoter.js
//
// Object promotion: replaces a local placeholder thing with a canonical
// external record. The canonical row gets thing_id = externalId and
// owner = provider-specific owner UUID (e.g. MUSICBRAINZ_OWNER).
//
// Mode A (UUID idScheme): create canonical row with thing_id = externalId.
// Mode B (opaque idScheme): create canonical row, store external ref in link.

import { UUID } from '../constants/uuid.js';

/**
 * Promote a local object to a canonical external record.
 *
 * @param {string} localThingId   — Current placeholder thing_id
 * @param {string} externalId     — MBID or other external identifier
 * @param {string} providerKey    — Provider key ('musicbrainz', etc.)
 * @param {object} options
 * @param {import('../localDb/backend/adapter').DbAdapter} options.db — Database adapter
 * @param {string} [options.ownerOverride] — Owner UUID override (defaults to provider mapping)
 * @param {string} [options.name]          — Canonical name (from provider)
 * @param {string} [options.description]   — Canonical description
 * @param {object} [options.payload]       — Extra data to store on the canonical row
 * @returns {Promise<void>}
 */
export async function promoteObject(localThingId, externalId, providerKey, options) {
    const { db, name, description, payload } = options;
    const owner = options.ownerOverride || getOwnerForProvider(providerKey);

    // Get the current local object data
    const localThing = await db.things.get(localThingId);
    if (!localThing) {
        throw new Error(`Local thing ${localThingId} not found`);
    }

    // Stamp existing local row as canonical (thing_id = externalId)
    // We reuse the row instead of delete+reinsert to preserve any user data
    // (e.g. user-added links, notes, etc.)
    const canonicalData = {
        ...localThing.data,
        ...(payload || {}),
        _originalId: localThingId,
        _promotedAt: Date.now(),
        _promotedBy: providerKey,
    };

    // Build the canonical row (inserted with externalId as thing_id)
    await db.things.put({
        thing_id: externalId,
        name: name || localThing.name,
        description: description || localThing.description,
        type: localThing.type,
        public: 1,                 // canonical records are public
        owner: owner,
        data: canonicalData,
        deleted: 0,
        ...(localThing.name_translations ? { name_translations: localThing.name_translations } : {}),
        ...(localThing.description_translations ? { description_translations: localThing.description_translations } : {}),
        ...(localThing.start ? { start: localThing.start } : {}),
        ...(localThing.end ? { end: localThing.end } : {}),
    });

    // Remap all references from the old placeholder to the canonical ID
    await remapReferences(localThingId, externalId, db);

    // Soft-delete the old placeholder
    await db.things.update(localThingId, {
        deleted: 1,
        data: {
            ...localThing.data,
            _mergedInto: externalId,
            _mergedAt: Date.now(),
        },
    });
}

/**
 * Walk all links and things that reference oldId and rewrite them to newId.
 *
 * @param {string} oldId
 * @param {string} newId
 * @param {import('../localDb/backend/adapter').DbAdapter} db
 */
export async function remapReferences(oldId, newId, db) {
    // Update links where oldId appears as one_thing_id
    const linksAsOne = await db.links.where('one_thing_id').equals(oldId).toArray();
    for (const link of linksAsOne) {
        await db.links.update(link.link_id || link.link_uuid, { one_thing_id: newId });
    }

    // Update links where oldId appears as other_thing_id
    const linksAsOther = await db.links.where('other_thing_id').equals(oldId).toArray();
    for (const link of linksAsOther) {
        await db.links.update(link.link_id || link.link_uuid, { other_thing_id: newId });
    }

    // Walk things that may reference oldId in their data
    // (e.g. parts referencing their parent song by oldId)
    const allThings = await db.things.toArray();
    for (const thing of allThings) {
        if (thing.data && typeof thing.data === 'object') {
            let changed = false;
            const newData = { ...thing.data };

            // Check common reference fields
            for (const field of ['parentId', 'songId', 'artistId', 'refId']) {
                if (newData[field] === oldId) {
                    newData[field] = newId;
                    changed = true;
                }
            }

            if (changed) {
                await db.things.update(thing.thing_id, { data: newData });
            }
        }
    }
}

/**
 * Get the canonical owner UUID for a provider.
 * @param {string} providerKey
 * @returns {string}
 */
function getOwnerForProvider(providerKey) {
    switch (providerKey) {
        case 'musicbrainz':
            return UUID.MUSICBRAINZ_OWNER;
        // Future: 'osm' → OSM_OWNER, etc.
        default:
            return UUID.SYSTEM_OWNER;
    }
}