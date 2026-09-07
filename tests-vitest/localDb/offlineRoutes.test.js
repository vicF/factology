// tests-vitest/localDb/offlineRoutes.test.js
//
// Server-mirror tools in the offline app:
//  - The Tools endpoints (/tools/*, /import, /export, /import/find-duplicates)
//    are implemented locally with the same shapes as the Laravel controllers.
//  - Any OTHER server-only write still fails cleanly (no junk "import" object,
//    no null.type crash).

import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, clearAll } from '@factology/engine/localDb/index.js';
import { seedLocalDb } from '@factology/engine/localDb/seeder.js';
import { UUID } from '@factology/engine/constants/uuid.js';
import { handleLocalApiCall } from '@factology/engine/localDb/apiHandler.js';

const CONTEXT = { userThingId: UUID.VICTOR_FOKIN, visibleOwners: new Set([UUID.VICTOR_FOKIN]) };

beforeEach(async () => {
    await clearAll();
    await seedLocalDb();
});

describe('tools endpoints are served locally', () => {
    it('POST /tools/consistency-check returns the server report shape', async () => {
        const res = await handleLocalApiCall('post', '/tools/consistency-check', {}, CONTEXT);
        expect(res.status).toBe(200);
        expect(res.data.success).toBe(true);
        expect(res.data.result).toHaveProperty('clean');
        expect(res.data.result).toHaveProperty('summary');
        expect(res.data.result).toHaveProperty('issues');
    });

    it('POST /tools/consistency-delete succeeds and reports failures', async () => {
        const res = await handleLocalApiCall('post', '/tools/consistency-delete',
            JSON.stringify({ ids: ['no-such-id'] }), CONTEXT);
        expect(res.data.success).toBe(true);
        expect(res.data.deleted).toBe(0);
        expect(Array.isArray(res.data.failed)).toBe(true);
    });

    it('POST /import/find-duplicates returns the matcher shape', async () => {
        const res = await handleLocalApiCall('post', '/import/find-duplicates', {}, CONTEXT);
        expect(res.data.success).toBe(true);
        expect(res.data.result).toHaveProperty('links_created');
        expect(Array.isArray(res.data.result.matches)).toBe(true);
    });

    it('POST /import with an invalid payload is rejected cleanly', async () => {
        await expect(
            handleLocalApiCall('post', '/import', {}, CONTEXT),
        ).rejects.toMatchObject({ response: { status: 422 } });
    });

    it('GET /export returns a parseable JSON backup string', async () => {
        const res = await handleLocalApiCall('get', '/export', null, CONTEXT);
        expect(res.status).toBe(200);
        const parsed = JSON.parse(res.data);
        expect(parsed.data.things.length).toBeGreaterThan(0);
        expect(parsed.data.links.length).toBeGreaterThan(0);
    });
});

describe('unknown server-only writes still fail cleanly', () => {
    it.each([
        ['/settings'],
        ['/search/options'],
    ])('POST %s → 501 offline_unavailable, no junk object created', async (url) => {
        await expect(
            handleLocalApiCall('post', url, {}, CONTEXT),
        ).rejects.toMatchObject({
            response: { status: 501, data: { code: 'offline_unavailable' } },
        });
        const junk = await getDb().objects.get('settings');
        expect(junk).toBeUndefined();
    });

    it('rejects PUT/DELETE to an unknown path too', async () => {
        await expect(
            handleLocalApiCall('put', '/settings', { foo: 'bar' }, CONTEXT),
        ).rejects.toMatchObject({ response: { status: 501 } });
        await expect(
            handleLocalApiCall('delete', '/archive/1', null, CONTEXT),
        ).rejects.toMatchObject({ response: { status: 501 } });
    });
});

describe('object writes still work offline', () => {
    it('creates an object under /object/{id} as before', async () => {
        const newId = crypto.randomUUID();
        const res = await handleLocalApiCall('post', `/object/${newId}`, JSON.stringify({
            name: 'Route test',
            type: UUID.G_CLASS,
            public: 1,
        }), CONTEXT);

        expect(res.status).toBe(200);
        const obj = await getDb().objects.get(newId);
        expect(obj).toBeTruthy();
        expect(obj.thing_id).toBe(newId);
    });

    it('keeps the bare POST /object search working', async () => {
        const res = await handleLocalApiCall('post', '/object', JSON.stringify({ search: '' }), CONTEXT);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.data.things)).toBe(true);
    });
});
