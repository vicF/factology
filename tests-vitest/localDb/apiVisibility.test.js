// tests-vitest/localDb/apiVisibility.test.js
//
// Guards the owner-visibility filter at the local API boundary: a locked /
// unknown identity's rows must not leak through search or direct get, and the
// union of unlocked identities is what is visible.

import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, clearAll } from '@factology/engine/localDb/index.js';
import { seedLocalDb } from '@factology/engine/localDb/seeder.js';
import { handleLocalApiCall } from '@factology/engine/localDb/apiHandler.js';
import { visibleOwnerSet } from '@factology/engine/localDb/visibility.js';
import { UUID } from '@factology/engine/constants/uuid.js';

const ID_A = 'identity-A';
const ID_B = 'identity-B';

function putPerson(id, name, owner) {
    return getDb().objects.put({
        thing_id: id,
        name,
        type: 3,
        public: 1,
        deleted: 0,
        owner,
    });
}

async function searchObjects(visibleOwners) {
    const res = await handleLocalApiCall('post', '/object', JSON.stringify({ type: [3] }), { visibleOwners });
    return res.data.things.map((t) => t.thing_id);
}

async function tryGet(id, visibleOwners) {
    try {
        await handleLocalApiCall('get', `/object/${id}`, null, { visibleOwners });
        return null;
    } catch (e) {
        return e?.response?.status ?? null;
    }
}

describe('owner visibility at the local API boundary', () => {
    beforeEach(async () => {
        await clearAll();
        await seedLocalDb();
        await putPerson('a-1', 'Alice private', ID_A);
        await putPerson('b-1', 'Bob private', ID_B);
    });

    it('search hides every identity row while everything is locked (empty set)', async () => {
        const ids = await searchObjects(visibleOwnerSet([]));
        expect(ids).not.toContain('a-1');
        expect(ids).not.toContain('b-1');
    });

    it('search shows the union of unlocked owners only', async () => {
        expect(await searchObjects(visibleOwnerSet([ID_A]))).toContain('a-1');
        expect(await searchObjects(visibleOwnerSet([ID_A]))).not.toContain('b-1');

        const both = await searchObjects(visibleOwnerSet([ID_A, ID_B]));
        expect(both).toContain('a-1');
        expect(both).toContain('b-1');
    });

    it('system-shared rows stay reachable even when everything is locked', async () => {
        // EVERYTHING is a system seed row (SYSTEM_OWNER) — still 200 while
        // every ordinary identity row is hidden.
        expect(await tryGet(UUID.EVERYTHING, visibleOwnerSet([]))).toBe(null);
    });

    it('direct get returns 404 for a locked identity row', async () => {
        expect(await tryGet('a-1', visibleOwnerSet([]))).toBe(404);
        expect(await tryGet('a-1', visibleOwnerSet([ID_A]))).toBe(null); // visible → 200
    });

    it('no filter (null owners) keeps pre-identity behavior — everything visible', async () => {
        const ids = await searchObjects(null);
        expect(ids).toContain('a-1');
        expect(ids).toContain('b-1');
        expect(await tryGet('a-1', null)).toBe(null);
    });
});
