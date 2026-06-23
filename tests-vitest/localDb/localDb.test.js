// tests-vitest/localDb/localDb.test.js

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    createObject,
    updateObject,
    deleteObject,
    hardDeleteObject,
    getObject,
    listObjects,
    searchObjects,
    enqueueChange,
    popPendingChanges,
    getPendingCount,
    updateSyncMetadata,
    getSyncMetadata,
    clearAll,
    SYNC_STATUS,
    CHANGE_OP,
} from '@/localDb/index';
import { getDb } from '@/localDb/index';

describe('LocalDB — Object CRUD', () => {
    beforeEach(async () => {
        await clearAll();
    });

    afterEach(async () => {
        await clearAll();
    });

    it('inserts an object with LOCAL_ONLY sync status (no server)', async () => {
        const id = await createObject({
            thing_id: '00000000-0000-0000-0000-000000000001',
            name: 'Test Object',
            type: 3,
            description: 'A test',
            public: 1,
            owner: 'owner-uuid',
        });

        expect(id).toBe('00000000-0000-0000-0000-000000000001');

        const obj = await getObject(id);
        expect(obj).toBeTruthy();
        expect(obj._syncStatus).toBe(SYNC_STATUS.LOCAL_ONLY);
        expect(obj._localRevision).toBe(1);
        expect(obj._serverRevision).toBe(0);
        expect(obj.name).toBe('Test Object');
    });

    it('inserts an object with LOCAL sync status when server is specified', async () => {
        const id = await createObject({
            thing_id: '00000000-0000-0000-0000-000000000002',
            name: 'Server Object',
            type: 3,
            public: 1,
        }, { serverId: 'server-uuid-1' });

        const obj = await getObject(id);
        expect(obj._syncStatus).toBe(SYNC_STATUS.LOCAL);
        expect(obj._serverId).toBe('server-uuid-1');
    });

    it('enqueues a pending change on create', async () => {
        await createObject({
            thing_id: '00000000-0000-0000-0000-000000000003',
            name: 'Pending Object',
            type: 3,
            public: 1,
        });

        const count = await getPendingCount();
        expect(count).toBe(1);

        const changes = await popPendingChanges();
        expect(changes[0].operation).toBe(CHANGE_OP.INSERT);
        expect(changes[0].table).toBe('objects');
        expect(changes[0].recordId).toBe('00000000-0000-0000-0000-000000000003');
    });

    it('updates an object and bumps _localRevision', async () => {
        const id = await createObject({
            thing_id: '00000000-0000-0000-0000-000000000004',
            name: 'Before Update',
            type: 3,
            public: 1,
        });

        await updateObject(id, { name: 'After Update' });

        const obj = await getObject(id);
        expect(obj.name).toBe('After Update');
        expect(obj._localRevision).toBe(2);
        // Created LOCAL_ONLY (no server) → stays LOCAL_ONLY after update
        expect(obj._syncStatus).toBe(SYNC_STATUS.LOCAL_ONLY);
    });

    it('transitions SYNCED object to LOCAL on update', async () => {
        const db = getDb();
        await db.objects.put({
            thing_id: '00000000-0000-0000-0000-000000000005',
            name: 'Synced Object',
            type: 3,
            public: 1,
            _syncStatus: SYNC_STATUS.SYNCED,
            _localRevision: 1,
            _serverRevision: 1,
            _serverId: 'server-1',
        });

        await updateObject('00000000-0000-0000-0000-000000000005', {
            name: 'Now Dirty',
        });

        const obj = await getObject('00000000-0000-0000-0000-000000000005');
        expect(obj._syncStatus).toBe(SYNC_STATUS.LOCAL);
        expect(obj._localRevision).toBe(2);
    });

    it('soft-deletes an object (mark deleted=true)', async () => {
        const id = await createObject({
            thing_id: '00000000-0000-0000-0000-000000000006',
            name: 'To Delete',
            type: 3,
            public: 1,
        });

        await deleteObject(id);

        const obj = await getObject(id);
        expect(obj.deleted).toBe(1);
        expect(obj._syncStatus).toBe(SYNC_STATUS.LOCAL);
    });

    it('soft-delete enqueues a DELETE change', async () => {
        const id = await createObject({
            thing_id: '00000000-0000-0000-0000-000000000007',
            name: 'Delete Pending',
            type: 3,
            public: 1,
        });

        // Drain pending changes from create
        await popPendingChanges();

        await deleteObject(id);

        const changes = await popPendingChanges();
        expect(changes[0].operation).toBe(CHANGE_OP.DELETE);
    });

    it('hard-deletes an object from the database', async () => {
        const id = await createObject({
            thing_id: '00000000-0000-0000-0000-000000000008',
            name: 'Hard Delete',
            type: 3,
            public: 1,
        });

        await hardDeleteObject(id);

        const obj = await getObject(id);
        expect(obj).toBeNull();
    });

    it('throws when updating a non-existent object', async () => {
        await expect(
            updateObject('non-existent-id', { name: 'Nope' })
        ).rejects.toThrow('Object not found in local DB');
    });

    it('deleteObject does nothing on non-existent record', async () => {
        // Should not throw
        await deleteObject('non-existent-id');
    });

    it('stores and retrieves JSON data field', async () => {
        const jsonData = { tags: ['a', 'b'], score: 42, nested: { key: 'value' } };

        await createObject({
            thing_id: '00000000-0000-0000-0000-000000000009',
            name: 'JSON Object',
            type: 3,
            public: 1,
            data: jsonData,
        });

        const obj = await getObject('00000000-0000-0000-0000-000000000009');
        expect(obj.data).toEqual(jsonData);
        expect(obj.data.nested.key).toBe('value');
    });

    it('skipChangeLog does not enqueue pending change', async () => {
        await createObject({
            thing_id: '00000000-0000-0000-0000-000000000010',
            name: 'No Log',
            type: 3,
            public: 1,
        }, { skipChangeLog: true });

        const count = await getPendingCount();
        expect(count).toBe(0);
    });
});

describe('LocalDB — Listing and Search', () => {
    beforeEach(async () => {
        await clearAll();
        await createObject({ thing_id: 'a-1', name: 'Alpha', type: 3, public: 1 });
        await createObject({ thing_id: 'a-2', name: 'Beta', type: 4, public: 1, description: 'First beta' });
        await createObject({ thing_id: 'a-3', name: 'Gamma', type: 3, public: 1, description: 'Another one' });
        // Soft-deleted
        await createObject({ thing_id: 'a-4', name: 'Deleted', type: 3, public: 1 });
        await deleteObject('a-4');
    });

    afterEach(async () => {
        await clearAll();
    });

    it('lists all non-deleted objects', async () => {
        const results = await listObjects();
        expect(results.length).toBe(3);
    });

    it('lists objects including deleted', async () => {
        const results = await listObjects({ includeDeleted: true });
        expect(results.length).toBe(4);
    });

    it('filters by type', async () => {
        const results = await listObjects({ type: 4 });
        expect(results.length).toBe(1);
        expect(results[0].name).toBe('Beta');
    });

    it('filters by sync status', async () => {
        const results = await listObjects({ syncStatus: SYNC_STATUS.LOCAL_ONLY });
        expect(results.length).toBe(3); // 3 non-deleted, all LOCAL_ONLY
    });

    it('searches by name (case-insensitive)', async () => {
        const results = await searchObjects('alp');
        expect(results.length).toBe(1);
        expect(results[0].name).toBe('Alpha');
    });

    it('searches by description', async () => {
        const results = await searchObjects('first');
        expect(results.length).toBe(1);
        expect(results[0].name).toBe('Beta');
    });

    it('respects limit', async () => {
        const results = await listObjects({ limit: 2 });
        expect(results.length).toBe(2);
    });
});

describe('LocalDB — Pending Changes Queue', () => {
    beforeEach(async () => {
        await clearAll();
    });

    it('enqueues and pops changes', async () => {
        await enqueueChange({
            operation: CHANGE_OP.INSERT,
            table: 'objects',
            recordId: 'test-1',
            payload: { name: 'Test' },
            serverId: 'server-1',
        });

        await enqueueChange({
            operation: CHANGE_OP.UPDATE,
            table: 'objects',
            recordId: 'test-2',
            payload: { name: 'Updated' },
            serverId: 'server-1',
        });

        const count = await getPendingCount();
        expect(count).toBe(2);

        const popped = await popPendingChanges();
        expect(popped.length).toBe(2);
        expect(await getPendingCount()).toBe(0);
    });

    it('filters pending changes by server', async () => {
        await enqueueChange({
            operation: CHANGE_OP.INSERT, table: 'objects',
            recordId: 's1', payload: {}, serverId: 'server-a',
        });
        await enqueueChange({
            operation: CHANGE_OP.INSERT, table: 'objects',
            recordId: 's2', payload: {}, serverId: 'server-b',
        });

        const countA = await getPendingCount('server-a');
        expect(countA).toBe(1);

        const poppedB = await popPendingChanges('server-b');
        expect(poppedB.length).toBe(1);
        expect(poppedB[0].recordId).toBe('s2');
    });

    it('respects limit when popping', async () => {
        for (let i = 0; i < 5; i++) {
            await enqueueChange({
                operation: CHANGE_OP.INSERT, table: 'objects',
                recordId: `r-${i}`, payload: {},
            });
        }

        const popped = await popPendingChanges(null, 3);
        expect(popped.length).toBe(3);
        expect(await getPendingCount()).toBe(2);
    });
});

describe('LocalDB — Sync Metadata', () => {
    beforeEach(async () => {
        await clearAll();
    });

    it('stores and retrieves sync metadata', async () => {
        const ts = Date.now();
        await updateSyncMetadata('server-1', 'pull', ts);

        const meta = await getSyncMetadata('server-1');
        expect(meta).toBeTruthy();
        expect(meta.lastPullTimestamp).toBe(ts);
    });

    it('updates existing metadata', async () => {
        await updateSyncMetadata('server-1', 'pull', 1000);
        await updateSyncMetadata('server-1', 'push', 2000);

        const meta = await getSyncMetadata('server-1');
        expect(meta.lastPullTimestamp).toBe(1000);
        expect(meta.lastPushTimestamp).toBe(2000);
    });

    it('returns null for unknown server', async () => {
        const meta = await getSyncMetadata('unknown');
        expect(meta).toBeNull();
    });
});
