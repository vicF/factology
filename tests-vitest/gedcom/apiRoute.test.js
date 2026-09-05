// tests-vitest/gedcom/apiRoute.test.js
//
// End-to-end: the offline adapter route POST /import/gedcom
// (apiHandler.handleLocalTool) parses + imports a GEDCOM file into the seeded
// Dexie DB and returns the Tools.vue result shape.

import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, clearAll } from '@/localDb/index';
import { seedLocalDb } from '@/localDb/seeder';
import { UUID } from '@/constants/uuid';
import { handleLocalApiCall } from '@/localDb/apiHandler';
import { CITED_BIBLIOGRAPHIC_GEDCOM } from '@/gedcom/gedcomFixtures';

const CONTEXT = { userThingId: UUID.VICTOR_FOKIN, visibleOwners: new Set([UUID.VICTOR_FOKIN]) };

function fileLike(text) {
    return { get: (key) => (key === 'file' ? { text: async () => text } : null) };
}

beforeEach(async () => {
    await clearAll();
    await seedLocalDb();
});

describe('POST /import/gedcom (offline route)', () => {
    it('imports a GEDCOM file and returns the Tools.vue result shape', async () => {
        const res = await handleLocalApiCall('post', '/import/gedcom', fileLike(CITED_BIBLIOGRAPHIC_GEDCOM), CONTEXT);

        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        const r = res.data.result;
        expect(typeof r.imported).toBe('number');
        expect(typeof r.updated).toBe('number');
        expect(r.skipped).toBe(0);
        expect(typeof r.errors).toBe('number');
        expect(Array.isArray(r.details)).toBe(true);
        expect(r.source_thing_id).toBeTruthy();

        // No junk "import" thing was created by misrouting.
        expect(await getDb().objects.get('import')).toBeUndefined();
        // Persons + sources actually landed.
        const humans = await getDb().objects.where('type').equals(3).toArray();
        expect(humans.length).toBeGreaterThan(0);
    });

    it('is idempotent: re-import updates instead of duplicating', async () => {
        const first = await handleLocalApiCall('post', '/import/gedcom', fileLike(CITED_BIBLIOGRAPHIC_GEDCOM), CONTEXT);
        const second = await handleLocalApiCall('post', '/import/gedcom', fileLike(CITED_BIBLIOGRAPHIC_GEDCOM), CONTEXT);

        expect(second.data.result.imported).toBe(0);
        expect(second.data.result.updated).toBeGreaterThan(0);
        expect(first.data.result.source_thing_id).toBe(second.data.result.source_thing_id);

        const links = await getDb().links.toArray();
        // No duplicate PRESENT / IMPORTED_FROM / class edges.
        const key = (l) => `${l.one_thing_id}|${l.link_type_id}|${l.other_thing_id}`;
        const seen = new Set();
        for (const l of links) {
            const k = key(l);
            expect(seen.has(k)).toBe(false);
            seen.add(k);
        }
    });

    it('rejects when no identity is unlocked (guest)', async () => {
        await expect(
            handleLocalApiCall('post', '/import/gedcom', fileLike(CITED_BIBLIOGRAPHIC_GEDCOM), {}),
        ).rejects.toMatchObject({ response: { status: 403 } });
    });

    it('rejects an empty file', async () => {
        await expect(
            handleLocalApiCall('post', '/import/gedcom', fileLike('   '), CONTEXT),
        ).rejects.toMatchObject({ response: { status: 422 } });
    });
});
