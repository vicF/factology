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

import { getDb } from './index';
import { SYNC_STATUS } from '../constants/syncStatus';
import { newLinkId } from './links';

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
    for (const thing of file.data.things) {
        if (!thing?.thing_id) {
            report.errors.push('Thing row missing thing_id, skipped.');
            continue;
        }

        const existing = await db.objects.get(thing.thing_id);
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

        await db.objects.put({
            ...thing,
            _syncStatus: SYNC_STATUS.LOCAL_ONLY,
            _localRevision: 0,
            _serverRevision: 0,
            _serverId: null,
        });
        report.imported++;
        importedThingIds.add(thing.thing_id);
    }

    // ── Links ─────────────────────────────────────────────────────────────
    // Import only links whose endpoints are present (imported or already local);
    // preserves link_uuid, mints a local link_id (server link_id is not portable).
    const linkRows = Array.isArray(file.data.links) ? file.data.links : [];
    for (const link of linkRows) {
        if (!link?.one_thing_id || !link?.other_thing_id) continue;

        const oneOk = importedThingIds.has(link.one_thing_id) || !!(await db.objects.get(link.one_thing_id));
        const otherOk = importedThingIds.has(link.other_thing_id) || !!(await db.objects.get(link.other_thing_id));
        if (!oneOk || !otherOk) continue;

        // Dedupe by canonical link_uuid
        if (link.link_uuid) {
            const existing = await db.links.where('link_uuid').equals(link.link_uuid).first();
            if (existing) continue;
        }

        // Also dedupe by endpoint triplet when the local row lacks a link_uuid
        // (seed rows have no link_uuid, so a fresh import of the same edge
        // would otherwise create a duplicate row).
        if (link.link_type_id) {
            const existing = await db.links
                .where('[one_thing_id+link_type_id+other_thing_id]')
                .equals([link.one_thing_id, link.link_type_id, link.other_thing_id])
                .first();
            if (existing && !existing.link_uuid) {
                // Adopt the canonical link_uuid onto the existing row instead
                // of inserting a new one.
                existing.link_uuid = link.link_uuid ?? null;
                await db.links.put(existing);
                continue;
            }
        }

        await db.links.put({
            ...link,
            link_id: newLinkId(),
            _syncStatus: SYNC_STATUS.LOCAL_ONLY,
            _localRevision: 0,
            _serverRevision: 0,
            _serverId: null,
        });
        report.importedLinks++;
    }

    return report;
}
