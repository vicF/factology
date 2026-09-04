// resources/js/localDb/importData.js
//
// Import an exported Factology data file (from the web app's Export button,
// or any server's /api/v1/export) into the local Dexie database.
//
// Owner-integrity rules (see docs/MULTI-INSTANCE-SYNC.md §1.7):
//   - Objects owned by the importing identity → imported, editable.
//   - Objects owned by someone else → skipped (not yours; read-only elsewhere).
//   - An object that already exists locally under a DIFFERENT owner than the
//     file claims → error, reported, not touched.
//
// Batched for speed: existing rows are prefetched (bulkGet), link dedupe uses
// one anyOf() lookup per key space, and writes go through bulkPut() in chunks
// — the old per-row `await` loop took minutes on large exports.

import { getDb } from './index';
import { SYNC_STATUS } from '../constants/syncStatus';
import { newLinkId } from './links';

const CHUNK = 500;
const TRIPLET = (l) => `${l.one_thing_id}|${l.link_type_id}|${l.other_thing_id}`;

async function chunkedPut(table, rows) {
    for (let i = 0; i < rows.length; i += CHUNK) {
        await table.bulkPut(rows.slice(i, i + CHUNK));
    }
}

async function chunkedAnyOf(table, index, keys) {
    const out = [];
    for (let i = 0; i < keys.length; i += 1000) {
        const slice = keys.slice(i, i + 1000);
        out.push(...await table.where(index).anyOf(slice).toArray());
    }
    return out;
}

function localFields() {
    return {
        _syncStatus: SYNC_STATUS.LOCAL_ONLY,
        _localRevision: 0,
        _serverRevision: 0,
        _serverId: null,
    };
}

/**
 * @param {object} file — parsed export JSON: { data: { things, links } }
 * @param {string} ownerThingId — the importing identity's thing_id
 * @returns {Promise<{ imported: number, importedLinks: number, skippedNotYours: number, skippedExisting: number, errors: string[] }>}
 */
export async function importExportData(file, ownerThingId) {
    const db = getDb();
    const report = {
        imported: 0,
        importedLinks: 0,
        skippedNotYours: 0,
        skippedExisting: 0,
        errors: [],
    };

    if (!file || typeof file !== 'object' || !Array.isArray(file.data?.things)) {
        throw new Error('Not a valid Factology export file.');
    }

    const importedThingIds = new Set();

    // ── Things ────────────────────────────────────────────────────────────
    const thingRows = file.data.things;
    const wantedIds = thingRows.map(t => t?.thing_id).filter(Boolean);

    // Prefetch every row the file mentions so conflict decisions are O(1).
    const existingById = new Map();
    if (wantedIds.length) {
        const found = await db.objects.bulkGet(wantedIds);
        wantedIds.forEach((id, i) => {
            if (found[i]) existingById.set(id, found[i]);
        });
    }

    const thingWrites = [];
    for (const thing of thingRows) {
        if (!thing?.thing_id) {
            report.errors.push('Thing row missing thing_id, skipped.');
            continue;
        }

        const existing = existingById.get(thing.thing_id);
        if (existing) {
            // §1.7: I own it here, the file claims a different owner → error.
            if (existing.owner && existing.owner !== thing.owner) {
                report.errors.push(
                    `Object ${thing.thing_id} exists with owner ${existing.owner}, ` +
                    `file claims ${thing.owner} — ignored.`,
                );
                continue;
            }
            report.skippedExisting++;
            importedThingIds.add(thing.thing_id);
            continue;
        }

        if (thing.owner !== ownerThingId) {
            report.skippedNotYours++;
            continue;
        }

        thingWrites.push({ ...thing, ...localFields() });
        report.imported++;
        importedThingIds.add(thing.thing_id);
    }
    await chunkedPut(db.objects, thingWrites);

    // ── Links ─────────────────────────────────────────────────────────────
    // Import only links whose endpoints are present (imported or already local);
    // preserves link_uuid, mints a local link_id (server link_id is not portable).
    const linkRows = Array.isArray(file.data.links) ? file.data.links : [];

    // Everything currently in the DB (not just rows in this file) so endpoint
    // existence checks are O(1) without a get() per link.
    const localIds = new Set(await db.objects.toCollection().keys());
    const allEndpointIds = new Set([...localIds, ...importedThingIds]);

    // Prefetch dedupe keys in two batched lookups instead of querying per link.
    const uuidToRow = new Map();
    const uuidKeys = linkRows.filter(l => l?.link_uuid).map(l => l.link_uuid);
    if (uuidKeys.length) {
        for (const row of await chunkedAnyOf(db.links, 'link_uuid', uuidKeys)) {
            if (row.link_uuid) uuidToRow.set(row.link_uuid, row);
        }
    }

    const tripletToRow = new Map();
    const tripletKeys = linkRows
        .filter(l => l?.one_thing_id && l?.link_type_id && l?.other_thing_id)
        .map(TRIPLET);
    if (tripletKeys.length) {
        const triplets = linkRows.filter(l => l?.one_thing_id && l?.link_type_id && l?.other_thing_id);
        const rows = await chunkedAnyOf(db.links, '[one_thing_id+link_type_id+other_thing_id]', triplets.map(l => [l.one_thing_id, l.link_type_id, l.other_thing_id]));
        for (const row of rows) {
            tripletToRow.set(`${row.one_thing_id}|${row.link_type_id}|${row.other_thing_id}`, row);
        }
    }

    const linkWrites = [];
    for (const link of linkRows) {
        if (!link?.one_thing_id || !link?.other_thing_id) continue;

        // Dedupe by canonical link_uuid.
        if (link.link_uuid && uuidToRow.has(link.link_uuid)) continue;

        // Dedupe by endpoint triplet when the local row lacks a link_uuid
        // (seed rows have no link_uuid, so a fresh import of the same edge
        // would otherwise create a duplicate row).
        if (link.link_type_id) {
            const existing = tripletToRow.get(TRIPLET(link));
            if (existing) {
                if (!existing.link_uuid) {
                    // Adopt the canonical link_uuid onto the existing row instead
                    // of inserting a new one.
                    existing.link_uuid = link.link_uuid ?? null;
                    await db.links.put(existing);
                }
                continue;
            }
        }

        const oneOk = importedThingIds.has(link.one_thing_id) || allEndpointIds.has(link.one_thing_id);
        const otherOk = importedThingIds.has(link.other_thing_id) || allEndpointIds.has(link.other_thing_id);
        if (!oneOk || !otherOk) continue;

        linkWrites.push({
            ...link,
            link_id: newLinkId(),
            ...localFields(),
        });
        report.importedLinks++;
    }
    await chunkedPut(db.links, linkWrites);

    return report;
}
