// resources/js/localDb/seeder.js
//
// Seeds the local IndexedDB with bootstrap objects.
// Source of truth: database/seeders/DatabaseSeeder.php
//
// Bootstrap objects are infrastructure records referenced by the code
// (e.g. UUID::ANYTHING, UUID::USER). They are NOT user data.

import { UUID } from '../constants/uuid';
import { getDb, SYNC_STATUS, createObject } from './index';

/**
 * Seed the local DB with bootstrap system objects.
 * Runs only once per DB lifetime (checks for UUID::ANYTHING).
 */
export async function seedLocalDb() {
    const db = getDb();

    // Check if already seeded
    const anything = await db.objects.get(UUID.ANYTHING);
    if (anything) {
        return; // Already seeded
    }

    console.log('[Seeder] Seeding bootstrap objects...');

    // ── Bootstrap things (mirrors database/seeders/DatabaseSeeder.php) ──
    const bootThings = [
        {
            thing_id: UUID.ANYTHING,
            name: 'Anything',
            description: 'base object for everything',
            type: UUID.G_CLASS,
            public: true,
            owner: UUID.VICTOR_FOKIN,
        },
        {
            thing_id: UUID.LINK,
            name: 'Link',
            description: 'base object for links',
            type: UUID.G_LINK,
            public: true,
            owner: UUID.VICTOR_FOKIN,
        },
        {
            thing_id: UUID.LINK_TO_PARENT,
            name: 'is a parent of',
            description: 'Type of parent link whatever it can mean',
            type: UUID.G_LINK,
            public: true,
            owner: UUID.VICTOR_FOKIN,
        },
        {
            thing_id: UUID.LINK_TO_CLASS,
            name: 'is of class',
            description: 'Link to a class of an object',
            type: UUID.G_LINK,
            public: true,
            owner: UUID.VICTOR_FOKIN,
        },
        {
            thing_id: UUID.SOMETHING,
            name: 'Something',
            description: 'base class for all other classes',
            type: UUID.G_CLASS,
            public: true,
            owner: UUID.VICTOR_FOKIN,
        },
        {
            thing_id: UUID.USER,
            name: 'User',
            description: 'base class for user objects',
            type: UUID.G_CLASS,
            public: false,
            owner: UUID.VICTOR_FOKIN,
        },
        {
            thing_id: UUID.SYSTEM,
            name: 'System',
            description: 'system class',
            type: UUID.G_CLASS,
            public: false,
            owner: UUID.VICTOR_FOKIN,
        },
        {
            thing_id: UUID.VICTOR_FOKIN,
            name: 'System',
            description: 'default owner / system account',
            type: UUID.GENERAL,
            public: false,
            owner: UUID.VICTOR_FOKIN,
        },
    ];

    for (const t of bootThings) {
        await db.objects.put({
            thing_id: t.thing_id,
            name: t.name,
            type: t.type,
            description: t.description || null,
            start: null,
            end: null,
            public: t.public ? 1 : 0,
            owner: t.owner,
            data: null,
            _syncStatus: SYNC_STATUS.SYNCED,
            _localRevision: 0,
            _serverRevision: 0,
            _serverId: null,
            _createdAt: Date.now(),
            _updatedAt: Date.now(),
        });
    }

    // ── Bootstrap links (class hierarchy edges) ──
    // Direction: one_thing_id is the PARENT, other_thing_id is the CHILD
    const bootLinks = [
        { one: UUID.ANYTHING, other: UUID.LINK,          translation: '"Link" is subclass of "Anything"' },
        { one: UUID.LINK,     other: UUID.LINK_TO_PARENT, translation: '"Parent" is subclass of "Link"' },
        { one: UUID.LINK,     other: UUID.LINK_TO_CLASS,  translation: '"Class of" is subclass of "Link"' },
        { one: UUID.ANYTHING, other: UUID.SOMETHING,      translation: '"Something" is subclass of "Anything"' },
    ];

    for (const l of bootLinks) {
        await db.links.put({
            link_id: `seed-boot-${l.one}-${l.other}`,
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
    }

    // ── Demo data (for standalone offline experience) ──
    const demoObjects = [
        {
            thing_id: 'a0000000-0000-0000-0000-000000000001',
            name: 'Welcome to Factology',
            type: UUID.G_THING,
            description: 'This is a demo object stored locally on your device. Everything works offline!',
            public: 1,
        },
        {
            thing_id: 'a0000000-0000-0000-0000-000000000002',
            name: 'Offline Note',
            type: UUID.G_THING,
            description: 'Objects you create are stored locally by default.',
            public: 0,
        },
        {
            thing_id: 'a0000000-0000-0000-0000-000000000003',
            name: 'Try Editing Me',
            type: UUID.G_THING,
            description: 'Tap the edit button to change this object.',
            public: 1,
        },
    ];

    for (const obj of demoObjects) {
        await db.objects.put({
            thing_id: obj.thing_id,
            name: obj.name,
            type: obj.type,
            description: obj.description || null,
            start: null,
            end: null,
            public: obj.public ?? 1,
            owner: UUID.VICTOR_FOKIN,
            data: null,
            _syncStatus: SYNC_STATUS.LOCAL_ONLY,
            _localRevision: 1,
            _serverRevision: 0,
            _serverId: null,
            _createdAt: Date.now(),
            _updatedAt: Date.now(),
        });

        // Link demo objects to "Something" class
        await db.links.put({
            link_id: `seed-class-${obj.thing_id}`,
            translation: `"${obj.name}" is of class "Something"`,
            one_thing_id: obj.thing_id,
            link_type_id: UUID.LINK_TO_CLASS,
            other_thing_id: UUID.SOMETHING,
            public: 1,
            _syncStatus: SYNC_STATUS.LOCAL_ONLY,
            _localRevision: 1,
            _serverRevision: 0,
            _serverId: null,
        });
    }

    console.log('[Seeder] Bootstrap seeded:', bootThings.length, 'things,',
        bootLinks.length, 'links,', demoObjects.length, 'demo objects');
}
