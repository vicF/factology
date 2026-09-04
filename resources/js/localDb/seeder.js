// resources/js/localDb/seeder.js
//
// Seeds the local IndexedDB with the same default objects as the web
// application (source of truth: database/seeders/DatabaseSeeder.php).
//
// The seed data itself lives in ./seedData.js so it can be shared and
// tested independently (tests-vitest/localDb/seederParity.test.js).

import { UUID } from '../constants/uuid';
import { getDb, SYNC_STATUS } from './index';
import {
    BOOTSTRAP_THINGS,
    BOOTSTRAP_LINKS,
    CLASSES,
    CLASS_LINKS,
} from './seedData';
import { SEED_TRANSLATIONS } from './seedTranslations';

const makeObject = (t) => ({
    thing_id: t.thing_id,
    name: t.name,
    type: t.type,
    description: t.description || null,
    name_translations: t.name_translations ?? SEED_TRANSLATIONS[t.thing_id] ?? null,
    description_translations: t.description_translations ?? null,
    start: null,
    end: null,
    public: t.public ? 1 : 0,
    owner: t.owner ?? UUID.VICTOR_FOKIN,
    data: null,
    _syncStatus: SYNC_STATUS.SYNCED,
    _localRevision: 0,
    _serverRevision: 0,
    _serverId: null,
    _createdAt: Date.now(),
    _updatedAt: Date.now(),
});

const makeLink = (l) => ({
    link_id: `seed-${l.one}-${l.other}`,
    description: l.description || null,
    one_thing_id: l.one,
    link_type_id: UUID.LINK_TO_PARENT,
    other_thing_id: l.other,
    public: 1,
    _syncStatus: SYNC_STATUS.SYNCED,
    _localRevision: 0,
    _serverRevision: 0,
    _serverId: null,
});

// Sentinel class id — presence proves the class list has been seeded.
const CITY_CLASS_ID = '14cd9c8b-84a4-4fd2-82a8-97477ff2d5ee';

/**
 * Normalize an already-seeded database: heal class-hierarchy edge duplicates
 * and backfill missing name_translations on seed objects.
 *
 * These are safe to run on every boot (cheap scans on a small index).
 */
async function normalizeSeedData(db) {
    // ── 1. Dedupe class-hierarchy (LINK_TO_PARENT) edges ────────────────
    // Collapse duplicate rows for the same (one, type, other) triplet into
    // one row, preferring the canonical link_uuid / SYNCED status.
    //
    // Only groups that involve a seed row (link_id `seed-…`) or a row without
    // a link_uuid are touched — that is the exact corruption signature of the
    // old import/sync (which could not dedupe seed rows because they lacked a
    // link_uuid). Two rows that both carry link_uuids are left alone (they may
    // be distinct synced records).
    const allHierarchy = await db.links
        .where('link_type_id')
        .equals(UUID.LINK_TO_PARENT)
        .toArray();

    const groups = {};
    for (const row of allHierarchy) {
        const key = row.one_thing_id + '|' + row.other_thing_id;
        if (!groups[key]) groups[key] = [];
        groups[key].push(row);
    }

    const toDelete = [];
    for (const rows of Object.values(groups)) {
        if (rows.length <= 1) continue;
        const involvesSeed = rows.some(r => r.link_id?.startsWith('seed-') || !r.link_uuid);
        if (!involvesSeed) continue;
        // Pick keeper: prefer SYNCED (seed), else row with link_uuid, else first.
        const keeper = rows.find(r => r._syncStatus === SYNC_STATUS.SYNCED)
            || rows.find(r => r.link_uuid)
            || rows[0];
        // Adopt the best link_uuid (from the deleted row if keeper lacks one).
        const bestUuid = rows.find(r => r.link_uuid)?.link_uuid ?? null;
        if (bestUuid && !keeper.link_uuid) {
            keeper.link_uuid = bestUuid;
            await db.links.put(keeper);
        }
        for (const row of rows) {
            if (row.link_id !== keeper.link_id) toDelete.push(row.link_id);
        }
    }
    if (toDelete.length > 0) {
        console.log('[Seeder] Removed', toDelete.length, 'duplicate class-hierarchy edges');
        await db.links.bulkDelete(toDelete);
    }

    // ── 2. Backfill missing name_translations on seed objects ────────────
    // Only fill when the field is null/empty — never overwrite user edits.
    for (const [id, nt] of Object.entries(SEED_TRANSLATIONS)) {
        const existing = await db.objects.get(id);
        if (existing && !existing.name_translations) {
            existing.name_translations = nt;
            await db.objects.put(existing);
        }
    }
}

// Legacy pre-parity demo objects (from the old standalone seeder).
const LEGACY_DEMO_IDS = [
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000003',
];

// Remove demo objects and any seed-* links created by the pre-parity seeder.
async function removeLegacySeedData(db) {
    for (const id of LEGACY_DEMO_IDS) {
        await db.objects.delete(id);
        await db.links.delete(`seed-class-${id}`);
    }
    const legacyLinks = await db.links
        .filter(l => l.link_id?.startsWith('seed-'))
        .toArray();
    if (legacyLinks.length > 0) {
        await db.links.bulkDelete(legacyLinks.map(l => l.link_id));
    }
}

/**
 * Seed the local DB with the same bootstrap objects and class hierarchy
 * as the web application. Handles both fresh installs and upgrades from
 * the pre-parity seeder (which only had bootstrap things + demo objects).
 */
export async function seedLocalDb() {
    const db = getDb();

    // Always run normalization (heals existing installs on every boot).
    await normalizeSeedData(db);

    const everything = await db.objects.get(UUID.EVERYTHING);
    const cityClass = await db.objects.get(CITY_CLASS_ID);

    // Fully seeded = sentinel objects exist AND the current link set is present.
    // The count check matters: installs seeded by an older APK keep their old
    // link set (adb install -r preserves app data), so if the hierarchy grew
    // since then the tree would be permanently incomplete.
    const expectedLinks = BOOTSTRAP_LINKS.length + CLASS_LINKS.length;
    const seedLinkCount = await db.links
        .filter(l => l.link_id?.startsWith('seed-'))
        .count();
    if (everything && cityClass && seedLinkCount >= expectedLinks) {
        return; // Fully seeded
    }

    await removeLegacySeedData(db);

    const allLinks = [...BOOTSTRAP_LINKS, ...CLASS_LINKS];

    if (!everything) {
        // Fresh install: bootstrap things + classes + hierarchy links
        for (const t of BOOTSTRAP_THINGS) {
            await db.objects.put(makeObject(t));
        }
        console.log('[Seeder] Seeding bootstrap objects...');
    } else {
        // Upgrade: bootstrap things already exist, top up classes + links.
        // (Also reached when the object sentinels exist but the link set is
        // stale — e.g. a DB seeded by an older APK with fewer links.)
        console.log('[Seeder] Upgrading: topping up class hierarchy (' +
            seedLinkCount + '/' + expectedLinks + ' links present)...');
    }

    for (const c of CLASSES) {
        await db.objects.put(makeObject(c));
    }
    for (const l of allLinks) {
        await db.links.put(makeLink(l));
    }

    console.log('[Seeder] Seeded:', BOOTSTRAP_THINGS.length, 'bootstrap things,',
        CLASSES.length, 'classes,', allLinks.length, 'links');
}
