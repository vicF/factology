// tests-vitest/gedcom/importerMapping.test.js
//
// Guards the client GEDCOM importer's core mapping on a real Dexie-over-
// fake-IndexedDB store: person naming/clean-up, event class-linking,
// PRESENT/INSIDE edges, family relations (MARRIED_TO / FATHER / MOTHER),
// marriage events, IMPORTED_FROM pins, idempotent re-import and place reuse —
// mirroring the server GedcomImportTest.

import { describe, it, expect, beforeEach } from 'vitest';
import { clearAll, getDb } from '@factology/engine/localDb/index.js';
import { seedLocalDb } from '@factology/engine/localDb/seeder.js';
import { createDexieStore } from '@factology/engine/gedcom/dexieStore.js';
import { importGedcom } from '@factology/engine/gedcom/gedcomImporter.js';
import { SIMPLE_FAMILY_GEDCOM, MARRIED_WOMAN_GEDCOM, RESIDENCE_PLACE_GEDCOM } from '@/gedcom/gedcomFixtures';
import { UUID } from '@factology/engine/constants/uuid.js';

const TEST_FILE = 'deadbeefdeadbeef'; // fixed 16-hex fileKey (avoids crypto.subtle)
const OWNER = UUID.VICTOR_FOKIN;

const db = getDb();
const store = createDexieStore();

async function thingsOfClass(clsId) {
    const classLinks = await db.links.where('other_thing_id').equals(clsId).toArray();
    const ids = new Set(classLinks.filter((l) => l.link_type_id === UUID.LINK_TO_CLASS).map((l) => l.one_thing_id));
    const all = await db.objects.toArray();
    return all.filter((o) => ids.has(o.thing_id));
}

async function classOfThing(thingId) {
    const classLinks = await db.links.where('link_type_id').equals(UUID.LINK_TO_CLASS).toArray();
    const row = classLinks.find((l) => l.one_thing_id === thingId);
    return row ? row.other_thing_id : null;
}

async function linksOfType(type) {
    const all = await db.links.toArray();
    return all.filter((l) => l.link_type_id === type && l.deleted !== true);
}

async function importedPins() {
    return linksOfType(UUID.IMPORTED_FROM);
}

async function humanByName(name) {
    const humans = await thingsOfClass(UUID.HUMAN);
    return humans.find((h) => h.name === name);
}

beforeEach(async () => {
    await clearAll();
    // clearAll() omits the external_links store (added for the URL/source
    // rows), so drop it too to keep each test isolated.
    await db.external_links.clear();
    await seedLocalDb();
});

describe('GEDCOM importer — person + family mapping', () => {
    it('imports a simple family and reports faithful counts + clean names', async () => {
        const res = await importGedcom({ content: SIMPLE_FAMILY_GEDCOM, ownerId: OWNER, store, fileKey: TEST_FILE });

        expect(res.errors).toBe(0);
        expect(res.details).toEqual([]);
        // 2 persons (John BIRT + Jane BIRT+DEAT events) + 1 marriage event + 1 MARRIED_TO
        expect(res.imported).toBe(7);
        expect(res.source_thing_id).toBeTruthy();

        const humans = await thingsOfClass(UUID.HUMAN);
        expect(humans.length).toBe(2);
        for (const p of humans) expect(p.name).not.toContain('/');

        expect(await humanByName('John Smith')).toBeTruthy();
        expect(await humanByName('Jane Doe')).toBeTruthy();

        // Source thing is linked to GEDCOM class and carries file_key in props.
        const source = await db.objects.get(res.source_thing_id);
        expect(source).toBeTruthy();
        expect(source.data.properties.file_key).toBe(TEST_FILE);
        expect(await classOfThing(res.source_thing_id)).toBe(UUID.GEDCOM_CLASS);
    });

    it('builds BIRT → BIRTH_CLASS events with PRESENT links that carry the date bounds', async () => {
        await importGedcom({ content: SIMPLE_FAMILY_GEDCOM, ownerId: OWNER, store, fileKey: TEST_FILE });

        const births = await thingsOfClass(UUID.BIRTH_CLASS);
        expect(births.length).toBe(2);

        // John's birth has an exact day; Jane's has only a year precision.
        const johnBirth = births.find((b) => b.start && b.start.startsWith('18560412'));
        expect(johnBirth).toBeTruthy();
        expect(johnBirth.name_translations).toBeTruthy();
        expect(johnBirth.data.properties.event_type).toBe('birth');

        // PRESENT link person → event carries link_start/link_start_meta.
        const presentLinks = await linksOfType(UUID.PRESENT);
        const toJohnBirth = presentLinks.filter((l) => l.other_thing_id === johnBirth.thing_id);
        expect(toJohnBirth.length).toBe(1);
        expect(toJohnBirth[0].one_thing_id).toBe((await humanByName('John Smith')).thing_id);
        expect(toJohnBirth[0].link_start).toBeTruthy();
        expect(toJohnBirth[0].link_start_meta).toBeTruthy();
    });

    it('creates MARRIED_TO / FATHER / MOTHER family edges and the marriage event', async () => {
        // Give the family a child to exercise FATHER/MOTHER edges.
        const childFixtures = SIMPLE_FAMILY_GEDCOM
            + '\n' + ['0 @I3@ INDI', '1 NAME Junior /Smith/', '1 SEX M', '0 TRLR'].join('\n')
            + '\n' + ['0 @F1@ FAM', '1 HUSB @I1@', '1 WIFE @I2@', '1 CHIL @I3@', '0 TRLR'].join('\n');

        await importGedcom({ content: childFixtures, ownerId: OWNER, store, fileKey: TEST_FILE });

        const john = await humanByName('John Smith');
        const jane = await humanByName('Jane Doe');
        const junior = await humanByName('Junior Smith');
        expect(john && jane && junior).toBeTruthy();

        // MARRIED_TO (undirected).
        const married = (await linksOfType(UUID.MARRIED_TO)).find(() => true);
        expect(married).toBeTruthy();

        // FATHER John→Junior, MOTHER Jane→Junior.
        expect((await linksOfType(UUID.FATHER)).some((l) =>
            l.one_thing_id === john.thing_id && l.other_thing_id === junior.thing_id)).toBe(true);
        expect((await linksOfType(UUID.MOTHER)).some((l) =>
            l.one_thing_id === jane.thing_id && l.other_thing_id === junior.thing_id)).toBe(true);

        // Marriage event thing under MARRIAGE_CLASS, named in Russian.
        const marriages = await thingsOfClass(UUID.MARRIAGE_CLASS);
        expect(marriages.length).toBe(1);
        expect(marriages[0].name).toContain('Свадьба:');
        expect(marriages[0].data.properties.event_type).toBe('marriage');
    });

    it('pins every imported thing with IMPORTED_FROM data.source_external_id prefixed by the fileKey', async () => {
        await importGedcom({ content: SIMPLE_FAMILY_GEDCOM, ownerId: OWNER, store, fileKey: TEST_FILE });

        const pins = await importedPins();
        expect(pins.length).toBeGreaterThan(0);
        for (const pin of pins) {
            expect(pin.data).toBeTruthy();
            expect(pin.data.source_external_id).toMatch(new RegExp('^' + TEST_FILE + '/'));
        }
    });

    it('is idempotent: re-import updates rather than duplicates rows/links', async () => {
        const first = await importGedcom({ content: SIMPLE_FAMILY_GEDCOM, ownerId: OWNER, store, fileKey: TEST_FILE });

        // Snapshot link counts, then re-import the same file.
        const linksByType = async (type) => (await linksOfType(type)).length;
        const before = {
            linkToClass: await linksByType(UUID.LINK_TO_CLASS),
            present: await linksByType(UUID.PRESENT),
            married: await linksByType(UUID.MARRIED_TO),
            imported: await linksByType(UUID.IMPORTED_FROM),
            things: await db.objects.count(),
        };

        const second = await importGedcom({ content: SIMPLE_FAMILY_GEDCOM, ownerId: OWNER, store, fileKey: TEST_FILE });

        expect(first.imported).toBe(7);
        expect(second.imported).toBe(0);
        expect(second.updated).toBeGreaterThan(0);

        // Edge/thing counts unchanged by the re-import (no duplicate links).
        expect(await linksByType(UUID.LINK_TO_CLASS)).toBe(before.linkToClass);
        expect(await linksByType(UUID.PRESENT)).toBe(before.present);
        expect(await linksByType(UUID.MARRIED_TO)).toBe(before.married);
        expect(await linksByType(UUID.IMPORTED_FROM)).toBe(before.imported);
        expect(await db.objects.count()).toBe(before.things);

        // Human + marriage things still present once each.
        expect((await thingsOfClass(UUID.HUMAN)).length).toBe(2);
        expect((await thingsOfClass(UUID.MARRIAGE_CLASS)).length).toBe(1);
    });
});

describe('GEDCOM importer — married-woman naming', () => {
    it('recomposes "Given Married (Birth)" when SEX F and _MARNM != SURN', async () => {
        await importGedcom({ content: MARRIED_WOMAN_GEDCOM, ownerId: OWNER, store, fileKey: TEST_FILE });

        const humans = await thingsOfClass(UUID.HUMAN);
        expect(humans.length).toBe(1);
        const w = humans[0];
        expect(w.name).toBe('Victoria McAllen (Smith)');
        expect(w.name).not.toContain('/');
        expect(w.data.properties.married_name).toBe('McAllen');
        expect(w.data.properties.surname).toBe('Smith');
    });
});

describe('GEDCOM importer — place handling', () => {
    it('reuses a single Place thing across two events in one file', async () => {
        await importGedcom({ content: RESIDENCE_PLACE_GEDCOM, ownerId: OWNER, store, fileKey: TEST_FILE });

        const places = await thingsOfClass(UUID.PLACE_CLASS);
        expect(places.length).toBe(1);
        expect(places[0].name).toBe('Москва');

        const inside = await linksOfType(UUID.INSIDE);
        expect(inside.length).toBe(2); // birth INSIDE Moscow + residence INSIDE Moscow
    });

    it('names a residence event after the place and localizes translations', async () => {
        await importGedcom({ content: RESIDENCE_PLACE_GEDCOM, ownerId: OWNER, store, fileKey: TEST_FILE });

        const residences = await thingsOfClass(UUID.RESIDENCE_CLASS);
        expect(residences.length).toBe(1);
        expect(residences[0].name).toContain('Проживание в Москва');
        expect(residences[0].name_translations.lang).toBe('ru');
        // Person's start came from birth (moved through FlexibleDate).
        const humans = await thingsOfClass(UUID.HUMAN);
        expect(humans[0].start).toContain('1856');
    });
});
