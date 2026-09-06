// tests-vitest/localDb/seederParity.test.js
//
// Guards that the local (standalone/mobile) seeder inserts the SAME default
// objects as the web application's DatabaseSeeder.php: every bootstrap thing,
// every class, and every class-hierarchy link declared in seedData.js.

import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, clearAll, SYNC_STATUS } from '@/localDb/index';
import { seedLocalDb } from '@/localDb/seeder';
import { UUID } from '@/constants/uuid';
import { SEED_TRANSLATIONS } from '@/localDb/seedTranslations';
import {
    BOOTSTRAP_THINGS,
    BOOTSTRAP_LINKS,
    CLASSES,
    CLASS_LINKS,
} from '@/localDb/seedData';

describe('Seeder parity with web DatabaseSeeder', () => {
    beforeEach(async () => {
        await clearAll();
    });

    it('seeds every bootstrap thing', async () => {
        await seedLocalDb();
        const db = getDb();
        const things = await db.objects.toArray();
        for (const t of BOOTSTRAP_THINGS) {
            const obj = things.find(o => o.thing_id === t.thing_id);
            expect(obj, `bootstrap thing "${t.name}"`).toBeTruthy();
            expect(obj.name).toBe(t.name);
            expect(obj.public).toBe(t.public ? 1 : 0);
        }
    });

    it('seeds every class declared for the web app', async () => {
        await seedLocalDb();
        const db = getDb();
        const things = await db.objects.toArray();
        for (const c of CLASSES) {
            const obj = things.find(o => o.thing_id === c.thing_id);
            expect(obj, `class "${c.name}" (${c.thing_id})`).toBeTruthy();
            expect(obj.name).toBe(c.name);
            // The seed array declares the intended type; classes are G_CLASS,
            // and rows moved to the Link taxonomy (e.g. "is a part of") are
            // G_LINK — both stay visible for the offline tree.
            expect(obj.type).toBe(c.type);
        }
    });

    it('seeds every class hierarchy link', async () => {
        await seedLocalDb();
        const db = getDb();
        const links = await db.links.toArray();
        const allLinks = [...BOOTSTRAP_LINKS, ...CLASS_LINKS];
        for (const l of allLinks) {
            const found = links.find(x =>
                x.one_thing_id === l.one &&
                x.other_thing_id === l.other &&
                x.link_type_id === UUID.LINK_TO_PARENT,
            );
            expect(found, `link ${l.one} -> ${l.other}`).toBeTruthy();
        }
    });

    it('marks Everything public (matches web seeder)', async () => {
        await seedLocalDb();
        const db = getDb();
        const everything = await db.objects.get(UUID.EVERYTHING);
        expect(everything.public).toBe(1);
    });

    it('has no leftover demo objects (web has none)', async () => {
        await seedLocalDb();
        const db = getDb();
        const demoIds = [
            'a0000000-0000-0000-0000-000000000001',
            'a0000000-0000-0000-0000-000000000002',
            'a0000000-0000-0000-0000-000000000003',
        ];
        for (const id of demoIds) {
            const obj = await db.objects.get(id);
            expect(obj, `demo object ${id} should not be seeded`).toBeFalsy();
        }
    });

    it('is idempotent (second call is a no-op)', async () => {
        await seedLocalDb();
        const db = getDb();
        const count1 = await db.objects.count();
        await seedLocalDb();
        const count2 = await db.objects.count();
        expect(count2).toBe(count1);
    });

    it('upgrades a DB seeded by the old demo seeder to full parity', async () => {
        const db = getDb();

        // Simulate the pre-parity seeder state: bootstrap thing + demo object,
        // old-format seed links.
        await db.objects.put({
            thing_id: UUID.EVERYTHING,
            name: 'Everything',
            type: UUID.G_CLASS,
            public: 1,
            _syncStatus: 'synced',
        });
        await db.objects.put({
            thing_id: 'a0000000-0000-0000-0000-000000000001',
            name: 'Welcome to Factology',
            type: 3,
            public: 1,
            _syncStatus: 'local_only',
        });
        await db.links.put({
            link_id: 'seed-boot-939cd822-9e23-450c-8c5e-c23f67cca792-3e15244c-a9e1-4a91-a0ca-1c65722a64df',
            one_thing_id: UUID.EVERYTHING,
            link_type_id: UUID.LINK_TO_PARENT,
            other_thing_id: UUID.SOMETHING,
            translation: 'old',
        });
        await db.links.put({
            link_id: 'seed-class-a0000000-0000-0000-0000-000000000001',
            one_thing_id: 'a0000000-0000-0000-0000-000000000001',
            link_type_id: UUID.LINK_TO_CLASS,
            other_thing_id: UUID.SOMETHING,
            translation: 'old',
        });

        await seedLocalDb();

        // Classes were added
        const city = await db.objects.get('14cd9c8b-84a4-4fd2-82a8-97477ff2d5ee');
        expect(city).toBeTruthy();
        expect(city.name).toBe('City');

        // Legacy demo objects were removed
        expect(await db.objects.get('a0000000-0000-0000-0000-000000000001')).toBeFalsy();

        // Old-format seed links were replaced with the canonical ones
        const links = await db.links.toArray();
        expect(links.some(l => l.link_id.startsWith('seed-boot-'))).toBe(false);
        expect(links.some(l =>
            l.link_id === 'seed-939cd822-9e23-450c-8c5e-c23f67cca792-3e15244c-a9e1-4a91-a0ca-1c65722a64df',
        )).toBe(true);
        expect(links.some(l => l.link_id.startsWith('seed-class-a0000000'))).toBe(false);
    });

    it('has no dangling link endpoints (every link references a seeded thing)', () => {
        const known = new Set([
            ...BOOTSTRAP_THINGS.map(t => t.thing_id),
            ...CLASSES.map(c => c.thing_id),
        ]);
        const allLinks = [...BOOTSTRAP_LINKS, ...CLASS_LINKS];
        const dangling = [];
        for (const l of allLinks) {
            if (!known.has(l.one)) dangling.push(`one=${l.one}`);
            if (!known.has(l.other)) dangling.push(`other=${l.other}`);
        }
        expect(dangling).toEqual([]);
    });

    it('has unique thing_ids across bootstrap things and classes', () => {
        const seen = new Map();
        for (const t of [...BOOTSTRAP_THINGS, ...CLASSES]) {
            if (seen.has(t.thing_id)) {
                throw new Error(`Duplicate thing_id "${t.thing_id}" (${seen.get(t.thing_id)} vs ${t.name})`);
            }
            seen.set(t.thing_id, t.name);
        }
        expect(seen.size).toBe(BOOTSTRAP_THINGS.length + CLASSES.length);
    });

    it('seeds name_translations for bootstrap things and classes', async () => {
        await seedLocalDb();
        const db = getDb();

        const character = await db.objects.get('f48ef10a-40f6-4190-bfae-2834e9781ad1');
        expect(character.name_translations).toEqual(SEED_TRANSLATIONS['f48ef10a-40f6-4190-bfae-2834e9781ad1']);
        expect(character.name_translations.ru).toBe('Персонаж');

        const everything = await db.objects.get(UUID.EVERYTHING);
        expect(everything.name_translations.ru).toBe('Всё');
    });

    it('backfills missing name_translations on a DB seeded before translations existed', async () => {
        // Simulate an older install: objects exist but carry no translations.
        const db = getDb();
        await seedLocalDb();

        // Strip translations, as a pre-translation install would have them.
        const all = await db.objects.toArray();
        await db.objects.bulkPut(all.map(o => {
            o.name_translations = null;
            return o;
        }));

        await seedLocalDb();

        const character = await db.objects.get('f48ef10a-40f6-4190-bfae-2834e9781ad1');
        expect(character.name_translations.ru).toBe('Персонаж');
    });

    it('does not overwrite user-edited name_translations', async () => {
        const db = getDb();
        await seedLocalDb();
        const id = 'f48ef10a-40f6-4190-bfae-2834e9781ad1';
        const obj = await db.objects.get(id);
        obj.name_translations = { lang: 'en', ru: 'Мой персонаж' };
        await db.objects.put(obj);

        await seedLocalDb();

        const after = await db.objects.get(id);
        expect(after.name_translations.ru).toBe('Мой персонаж');
    });

    it('dedupes duplicate class-hierarchy edges (heals buggy-import DBs)', async () => {
        const db = getDb();
        await seedLocalDb();

        // Corrupt the DB like the old import did: one parallel row per seed edge,
        // carrying a link_uuid (the seed rows have none).
        const seedRows = await db.links
            .where('link_type_id')
            .equals(UUID.LINK_TO_PARENT)
            .toArray();
        for (let i = 0; i < seedRows.length; i++) {
            const s = seedRows[i];
            await db.links.put({
                link_id: `corrupt-${i}`,
                one_thing_id: s.one_thing_id,
                link_type_id: UUID.LINK_TO_PARENT,
                other_thing_id: s.other_thing_id,
                link_uuid: `22222222-3333-4444-5555-${String(i).padStart(12, '0')}`,
                public: 1,
                _syncStatus: SYNC_STATUS.LOCAL_ONLY,
            });
        }

        await seedLocalDb();

        // Back to one row per edge.
        const after = await db.links
            .where('link_type_id')
            .equals(UUID.LINK_TO_PARENT)
            .toArray();
        expect(after.length).toBe(seedRows.length);

        // The kept rows now carry the canonical link_uuid adopted from the dup.
        for (const row of after) {
            expect(row.link_uuid).toBeTruthy();
        }
    });
});
