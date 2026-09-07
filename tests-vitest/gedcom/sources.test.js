// tests-vitest/gedcom/sources.test.js
//
// Guards the client GEDCOM importer's citation handling and source taxonomy:
//   • a bibliographic source becomes a thing classed under SOURCE_CLASS and
//     keeps its URL as an external link;
//   • a URL-only source creates NO thing — its URL is attached to the objects
//     that cite it (as an external link on the birth event);
//   • cited bibliographic sources get a source → EVIDENCE → citing edge;
//   • uncited URL-only sources create absolutely nothing.
// Mirrors the server GedcomImportSourcesTest.

import { describe, it, expect, beforeEach } from 'vitest';
import { clearAll, getDb } from '@factology/engine/localDb/index.js';
import { seedLocalDb } from '@factology/engine/localDb/seeder.js';
import { createDexieStore } from '@factology/engine/gedcom/dexieStore.js';
import { importGedcom } from '@factology/engine/gedcom/gedcomImporter.js';
import {
    STANDALONE_BIBLIOGRAPHIC_GEDCOM,
    CITED_BIBLIOGRAPHIC_GEDCOM,
    URL_ONLY_SOURCE_GEDCOM,
    UNCITED_URL_ONLY_GEDCOM,
} from '@/gedcom/gedcomFixtures';
import { UUID } from '@factology/engine/constants/uuid.js';

const TEST_FILE = 'deadbeefdeadbeef';
const OWNER = UUID.VICTOR_FOKIN;

const db = getDb();
const store = createDexieStore();

async function thingsOfClass(clsId) {
    const classLinks = await db.links.where('other_thing_id').equals(clsId).toArray();
    const ids = new Set(classLinks.filter((l) => l.link_type_id === UUID.LINK_TO_CLASS).map((l) => l.one_thing_id));
    return (await db.objects.toArray()).filter((o) => ids.has(o.thing_id));
}

async function findAllExternalLinks({ thingId, url } = {}) {
    const rows = await db.external_links.toArray();
    return rows.filter((l) => {
        if (thingId && l.thing_id !== thingId) return false;
        if (url && l.url !== url) return false;
        return true;
    });
}

async function birthEvent() {
    const births = await thingsOfClass(UUID.BIRTH_CLASS);
    return births[0];
}

async function anythingByName(name) {
    const all = await db.objects.toArray();
    return all.filter((o) => o.name === name);
}

async function sourceByName(name) {
    const sources = await thingsOfClass(UUID.SOURCE_CLASS);
    return sources.find((s) => s.name === name);
}

async function evidenceEdges() {
    const all = await db.links.toArray();
    return all.filter((l) => l.link_type_id === UUID.EVIDENCE);
}

beforeEach(async () => {
    await clearAll();
    // clearAll() omits the external_links store (added for the URL/source
    // rows), so drop it too to keep each test isolated.
    await db.external_links.clear();
    await seedLocalDb();
});

describe('GEDCOM importer — sources & citations', () => {
    it('url-only sources become external links on the citing event, not things', async () => {
        const res = await importGedcom({ content: URL_ONLY_SOURCE_GEDCOM, ownerId: OWNER, store, fileKey: TEST_FILE });
        expect(res.errors).toBe(0);

        // No thing is materialized for the URL-only source (its "title" is a URL).
        const thingsNamed = await anythingByName('www.example-site.ru');
        expect(thingsNamed.length).toBe(0);

        // The birth event cites it → the URL is an external link on the event.
        const event = await birthEvent();
        expect(event).toBeTruthy();
        const links = await findAllExternalLinks({ thingId: event.thing_id, url: 'http://www.example-site.ru/page' });
        expect(links.length).toBe(1);
    });

    it('uncited url-only sources create nothing', async () => {
        await importGedcom({ content: UNCITED_URL_ONLY_GEDCOM, ownerId: OWNER, store, fileKey: TEST_FILE });

        const thingsNamed = await anythingByName('www.orphan-site.org');
        expect(thingsNamed.length).toBe(0);
        expect(await db.external_links.count()).toBe(0);
    });

    it('bibliographic sources are classed under SOURCE_CLASS and keep URL as external link', async () => {
        await importGedcom({ content: STANDALONE_BIBLIOGRAPHIC_GEDCOM, ownerId: OWNER, store, fileKey: TEST_FILE });

        const source = await sourceByName('Указатель «Возвращенные имена»');
        expect(source).toBeTruthy();

        // Classed under the real Source class (never under EVIDENCE-as-class).
        const classLinks = await db.links.where('link_type_id').equals(UUID.LINK_TO_CLASS).toArray();
        expect(classLinks.some((l) => l.one_thing_id === source.thing_id && l.other_thing_id === UUID.SOURCE_CLASS)).toBe(true);
        expect(classLinks.some((l) => l.one_thing_id === source.thing_id && l.other_thing_id === UUID.EVIDENCE)).toBe(false);

        // URL stored as external link on the source object.
        const rows = await findAllExternalLinks({ thingId: source.thing_id, url: 'http://pamyat-naroda.ru/book' });
        expect(rows.length).toBe(1);
    });

    it('a cited bibliographic source gets a source → EVIDENCE → event citation edge', async () => {
        await importGedcom({ content: CITED_BIBLIOGRAPHIC_GEDCOM, ownerId: OWNER, store, fileKey: TEST_FILE });

        const source = await sourceByName('Метрическая книга');
        const event = await birthEvent();
        expect(source).toBeTruthy();
        expect(event).toBeTruthy();

        const edges = await evidenceEdges();
        expect(edges.some((l) =>
            l.one_thing_id === source.thing_id && l.other_thing_id === event.thing_id)).toBe(true);
    });

    it('dedupe + idempotency leave no duplicate evidence or source url attachments on re-import', async () => {
        const content = CITED_BIBLIOGRAPHIC_GEDCOM;
        await importGedcom({ content, ownerId: OWNER, store, fileKey: TEST_FILE });
        const second = await importGedcom({ content, ownerId: OWNER, store, fileKey: TEST_FILE });

        expect(second.imported).toBe(0);
        expect(second.updated).toBeGreaterThan(0);

        const source = await sourceByName('Метрическая книга');
        const event = await birthEvent();
        // Single bibliographic source, single evidence edge, single url row.
        expect((await thingsOfClass(UUID.SOURCE_CLASS)).length).toBe(1);
        const edges = await evidenceEdges();
        expect(edges.filter((l) =>
            l.one_thing_id === source.thing_id && l.other_thing_id === event.thing_id).length).toBe(1);
        expect((await findAllExternalLinks({ thingId: source.thing_id, url: 'http://example.org/metric' })).length).toBe(1);
    });
});
