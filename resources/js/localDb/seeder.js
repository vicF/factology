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

const makeObject = (t) => ({
    thing_id: t.thing_id,
    name: t.name,
    type: t.type,
    description: t.description || null,
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
    translation: l.translation,
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

    const everything = await db.objects.get(UUID.EVERYTHING);
    const cityClass = await db.objects.get(CITY_CLASS_ID);
    if (everything && cityClass) {
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
        // Upgrade: bootstrap things already exist, add classes + links
        console.log('[Seeder] Upgrading: adding web class hierarchy...');
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
