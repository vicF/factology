// tests-vitest/sync/syncEngine.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { SyncEngine } from '@/sync/SyncEngine';
import {
    createObject,
    updateObject,
    deleteObject,
    getObject,
    listObjects,
    clearAll,
    updateSyncMetadata,
    getSyncMetadata,
    getPendingCount,
    popPendingChanges,
    SYNC_STATUS,
    CHANGE_OP,
    getDb,
} from '@/localDb/index';
import { saveLink, getLink, getLinkByUuid, listLinksForThing } from '@/localDb/links';

// Mock axios
vi.mock('axios', () => ({
    default: {
        post: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        put: vi.fn(),
    },
}));

// Mock eventBus
vi.mock('@/eventBus', () => ({
    eventBus: {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
    },
}));

// Mock networkMonitor
vi.mock('@/utils/networkMonitor', () => ({
    networkMonitor: {
        isOnline: { value: true },
        isServerReachable: { value: true },
        checkServer: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
    },
}));

const SERVER_ID = 'test-server-0000-0000-0000-000000000001';

describe('SyncEngine — Pull', () => {
    let engine;

    beforeEach(async () => {
        await clearAll();
        engine = new SyncEngine();
        vi.clearAllMocks();
    });

    it('pulls new objects from server and applies them', async () => {
        axios.post.mockResolvedValueOnce({
            data: {
                changes: {
                    objects: [
                        {
                            thing_id: 'svr-obj-1',
                            name: 'Server Object',
                            type: 3,
                            description: 'From server',
                            _serverRevision: 1,
                        },
                    ],
                },
                server_timestamp: 1000,
            },
        });

        const result = await engine.pull(SERVER_ID);

        expect(result.applied).toBe(1);
        expect(result.conflicts).toBe(0);

        const obj = await getObject('svr-obj-1');
        expect(obj).toBeTruthy();
        expect(obj._syncStatus).toBe(SYNC_STATUS.SERVER_ONLY);
        expect(obj.name).toBe('Server Object');

        // Sync metadata updated
        const meta = await getSyncMetadata(SERVER_ID);
        expect(meta.lastPullTimestamp).toBe(1000);
    });

    it('pulls with since timestamp from sync metadata', async () => {
        await updateSyncMetadata(SERVER_ID, 'pull', 500);

        axios.post.mockResolvedValueOnce({
            data: {
                changes: { objects: [], links: [] },
                server_timestamp: 1500,
            },
        });

        await engine.pull(SERVER_ID);

        // Verify the request included the 'since' parameter
        expect(axios.post).toHaveBeenCalledWith(
            '/api/v1/sync/pull',
            expect.objectContaining({ since: 500 })
        );
    });

    it("pulls server deletion — hard-deletes local record if not modified", async () => {
        // Create a SERVER_ONLY object (pulled earlier, never modified locally)
        const db = getDb();
        await db.objects.put({
            thing_id: 'del-obj-1',
            name: 'To Be Deleted',
            type: 3,
            _syncStatus: SYNC_STATUS.SERVER_ONLY,
            _localRevision: 0,
            _serverRevision: 1,
        });

        axios.post.mockResolvedValueOnce({
            data: {
                changes: {
                    objects: [
                        { thing_id: 'del-obj-1', _deleted: true, _serverRevision: 2 },
                    ],
                },
                server_timestamp: 2000,
            },
        });

        const result = await engine.pull(SERVER_ID);
        expect(result.applied).toBe(1);

        const obj = await getObject('del-obj-1');
        expect(obj).toBeNull();
    });

    it("does NOT delete local record if it has un-pushed local changes", async () => {
        // Create an object with LOCAL changes
        await createObject({
            thing_id: 'protect-obj-1',
            name: 'Protected Local',
            type: 3,
            public: 1,
        }, { serverId: SERVER_ID });

        axios.post.mockResolvedValueOnce({
            data: {
                changes: {
                    objects: [
                        { thing_id: 'protect-obj-1', _deleted: true, _serverRevision: 2 },
                    ],
                },
                server_timestamp: 2000,
            },
        });

        const result = await engine.pull(SERVER_ID);
        expect(result.applied).toBe(0);

        // Object still exists
        const obj = await getObject('protect-obj-1');
        expect(obj).toBeTruthy();
    });

    it('detects conflict when both local and server changed same record', async () => {
        // Create local object
        await createObject({
            thing_id: 'conflict-obj-1',
            name: 'Local Name',
            type: 3,
            public: 1,
        }, { serverId: SERVER_ID });

        // Simulate: the object was synced before (so it has _serverRevision)
        await updateObject('conflict-obj-1', { _serverRevision: 1 }, { skipChangeLog: true });

        // Now update local (bump _localRevision)
        await updateObject('conflict-obj-1', { name: 'Locally Updated' });

        axios.post.mockResolvedValueOnce({
            data: {
                changes: {
                    objects: [
                        {
                            thing_id: 'conflict-obj-1',
                            name: 'Server Updated',
                            _serverRevision: 3,
                        },
                    ],
                },
                server_timestamp: 2000,
            },
        });

        const result = await engine.pull(SERVER_ID);
        expect(result.conflicts).toBe(1);

        const obj = await getObject('conflict-obj-1');
        expect(obj._syncStatus).toBe(SYNC_STATUS.CONFLICT);
    });

    it('pulls links, matches by link_uuid and mints a local link_id', async () => {
        axios.post.mockResolvedValueOnce({
            data: {
                changes: {
                    objects: [],
                    links: [
                        {
                            link_id: 'svr-link-999', // instance-specific — must NOT be trusted
                            link_uuid: 'uuid-link-1',
                            one_thing_id: 'thing-a',
                            link_type_id: 'type-1',
                            other_thing_id: 'thing-b',
                            public: true,
                            _serverRevision: 1,
                        },
                    ],
                },
                server_timestamp: 1000,
            },
        });

        await engine.pull(SERVER_ID);

        const link = await getLinkByUuid('uuid-link-1');
        expect(link).toBeTruthy();
        expect(link.link_id).not.toBe('svr-link-999'); // local PK is minted, not the server's
        expect(link.link_id).toMatch(/^link-/);
        expect(link.one_thing_id).toBe('thing-a');
        expect(link._syncStatus).toBe(SYNC_STATUS.SERVER_ONLY);
        expect(link._serverRevision).toBe(1);
    });

    it('re-pull of a link matches by link_uuid — no duplicate, PK preserved', async () => {
        // First pull creates the local record with a minted link_id.
        axios.post.mockResolvedValueOnce({
            data: {
                changes: {
                    objects: [],
                    links: [{
                        link_id: 'svr-link-1',
                        link_uuid: 'uuid-link-2',
                        one_thing_id: 'thing-a',
                        link_type_id: 'type-1',
                        other_thing_id: 'thing-b',
                        public: true,
                        _serverRevision: 1,
                    }],
                },
                server_timestamp: 1000,
            },
        });
        await engine.pull(SERVER_ID);

        const first = await getLinkByUuid('uuid-link-2');
        expect(first).toBeTruthy();

        // Second pull — the server row now carries a different link_id
        // (it was re-synced through another instance).
        axios.post.mockResolvedValueOnce({
            data: {
                changes: {
                    objects: [],
                    links: [{
                        link_id: 'svr-link-777',
                        link_uuid: 'uuid-link-2',
                        one_thing_id: 'thing-a',
                        link_type_id: 'type-1',
                        other_thing_id: 'thing-b',
                        public: true,
                        _serverRevision: 2,
                    }],
                },
                server_timestamp: 2000,
            },
        });
        await engine.pull(SERVER_ID);

        const links = await listLinksForThing('thing-a');
        expect(links.length).toBe(1); // still a single row
        expect(links[0].link_id).toBe(first.link_id); // local PK preserved
        expect(links[0]._serverRevision).toBe(2);
    });

    it('pulls a link deletion by link_uuid and removes the local record', async () => {
        // Pre-existing SERVER_ONLY local record (synced earlier).
        const db = getDb();
        await db.links.put({
            link_id: 'local-link-del',
            link_uuid: 'uuid-del-1',
            one_thing_id: 'thing-a',
            link_type_id: 'type-1',
            other_thing_id: 'thing-b',
            public: true,
            _syncStatus: SYNC_STATUS.SERVER_ONLY,
            _localRevision: 0,
            _serverRevision: 1,
        });

        axios.post.mockResolvedValueOnce({
            data: {
                changes: {
                    objects: [],
                    links: [{
                        link_id: 'svr-link-del',
                        link_uuid: 'uuid-del-1',
                        _deleted: true,
                        _serverRevision: 2,
                    }],
                },
                server_timestamp: 2000,
            },
        });

        await engine.pull(SERVER_ID);

        expect(await getLinkByUuid('uuid-del-1')).toBeNull();
        expect(await getLink('local-link-del')).toBeNull();
    });

    it('handles empty pull gracefully', async () => {
        axios.post.mockResolvedValueOnce({
            data: {
                changes: { objects: [], links: [] },
                server_timestamp: 1000,
            },
        });

        const result = await engine.pull(SERVER_ID);
        expect(result.applied).toBe(0);
        expect(result.conflicts).toBe(0);
    });
});

describe('SyncEngine — Push', () => {
    let engine;

    beforeEach(async () => {
        await clearAll();
        engine = new SyncEngine();
        vi.clearAllMocks();
    });

    it('pushes pending changes and marks them synced on success', async () => {
        // Create object with pending change
        await createObject({
            thing_id: 'push-obj-1',
            name: 'Push Me',
            type: 3,
            public: 1,
        }, { serverId: SERVER_ID });

        axios.post.mockResolvedValueOnce({
            data: {
                accepted: ['push-obj-1'],
                conflicts: [],
                server_timestamp: 1000,
            },
        });

        const result = await engine.push(SERVER_ID);

        expect(result.accepted).toBe(1);
        expect(result.conflicts).toBe(0);

        // Object should be marked SYNCED
        const obj = await getObject('push-obj-1');
        expect(obj._syncStatus).toBe(SYNC_STATUS.SYNCED);
        expect(obj._localRevision).toBe(0);

        // Pending queue should be empty
        const count = await getPendingCount(SERVER_ID);
        expect(count).toBe(0);
    });

    it('returns early when no pending changes', async () => {
        // Ensure queue is empty
        await popPendingChanges(SERVER_ID);

        const result = await engine.push(SERVER_ID);

        expect(result.accepted).toBe(0);
        expect(axios.post).not.toHaveBeenCalled();
    });

    it('handles push conflict returned by server', async () => {
        await createObject({
            thing_id: 'push-cfl-1',
            name: 'Push Conflict',
            type: 3,
            public: 1,
        }, { serverId: SERVER_ID });

        // Set localSynced flag so it looks like it was synced before
        await updateObject('push-cfl-1', { _serverRevision: 1 }, { skipChangeLog: true });
        await updateObject('push-cfl-1', { name: 'Locally Changed' });

        axios.post.mockResolvedValueOnce({
            data: {
                accepted: [],
                conflicts: [
                    {
                        record_id: 'push-cfl-1',
                        server_version: {
                            thing_id: 'push-cfl-1',
                            name: 'Server Changed',
                            _serverRevision: 5,
                        },
                        reason: 'server has newer version',
                    },
                ],
                server_timestamp: 1000,
            },
        });

        const result = await engine.push(SERVER_ID);

        expect(result.conflicts).toBe(1);

        // Object should be in conflict state
        const obj = await getObject('push-cfl-1');
        expect(obj._syncStatus).toBe(SYNC_STATUS.CONFLICT);
        expect(obj._localConflictData).toBeTruthy();
        expect(obj._serverConflictData).toBeTruthy();
    });

    it('groups pending changes by table in push payload', async () => {
        await createObject({
            thing_id: 'group-obj-1',
            name: 'Object 1',
            type: 3,
            public: 1,
        }, { serverId: SERVER_ID });

        await saveLink({
            link_id: 'group-link-1',
            one_thing_id: 'thing-a',
            link_type_id: 'type-1',
            other_thing_id: 'thing-b',
            public: true,
        }, { serverId: SERVER_ID });

        axios.post.mockResolvedValueOnce({
            data: { accepted: ['group-obj-1', 'group-link-1'], conflicts: [], server_timestamp: 1000 },
        });

        await engine.push(SERVER_ID);

        const callArgs = axios.post.mock.calls[0];
        const payload = callArgs[1];
        expect(payload.changes.objects.length).toBe(1);
        expect(payload.changes.links.length).toBe(1);
    });
});

describe('SyncEngine — Full Sync Cycle', () => {
    let engine;

    beforeEach(async () => {
        await clearAll();
        engine = new SyncEngine();
        vi.clearAllMocks();
    });

    it('runs pull → push cycle', async () => {
        // Create a local object so we have something to push
        await createObject({
            thing_id: 'cycle-local-1',
            name: 'Local Object',
            type: 3,
            public: 1,
        }, { serverId: SERVER_ID });

        // Server has new objects (pull response)
        axios.post.mockResolvedValueOnce({
            data: {
                changes: {
                    objects: [
                        { thing_id: 'cycle-obj-1', name: 'Server Side', type: 3, _serverRevision: 1 },
                    ],
                },
                server_timestamp: 1000,
            },
        });

        // Push succeeds (push response)
        axios.post.mockResolvedValueOnce({
            data: { accepted: ['cycle-local-1'], conflicts: [], server_timestamp: 1000 },
        });

        const result = await engine.sync(SERVER_ID);

        expect(result.pulled).toBe(1);
        expect(result.pushed).toBe(1);

        // One API call for pull, one for push
        expect(axios.post).toHaveBeenCalledTimes(2);
        expect(axios.post.mock.calls[0][0]).toContain('/sync/pull');
        expect(axios.post.mock.calls[1][0]).toContain('/sync/push');
    });

    it('skips push when no local changes', async () => {
        // Server has no changes
        axios.post.mockResolvedValueOnce({
            data: { changes: { objects: [], links: [] }, server_timestamp: 1000 },
        });

        // Push should still be attempted (for completeness), but returns early since no pending changes
        const result = await engine.sync(SERVER_ID);

        expect(result.pulled).toBe(0);
        expect(result.pushed).toBe(0);
    });

    it('does not run parallel sync for same server', async () => {
        // First sync — unresolved promise
        let resolvePull;
        const pullPromise = new Promise(resolve => { resolvePull = resolve; });
        axios.post.mockReturnValueOnce(pullPromise);

        // Start first sync (don't await)
        const sync1 = engine.sync(SERVER_ID);

        // Second sync should return early
        const sync2 = await engine.sync(SERVER_ID);
        expect(sync2.pulled).toBe(0);
        expect(sync2.pushed).toBe(0);

        // Clean up: resolve and await first sync
        resolvePull({ data: { changes: { objects: [], links: [] }, server_timestamp: 1000 } });
        await sync1;
    });
});

describe('SyncEngine — Conflict Resolution', () => {
    let engine;

    beforeEach(async () => {
        await clearAll();
        engine = new SyncEngine();
        vi.clearAllMocks();
    });

    it('resolves conflicted object with LOCAL_WINS strategy', async () => {
        // Set up a conflict manually
        await createObject({
            thing_id: 'resolve-1',
            name: 'Original',
            type: 3,
            public: 1,
        }, { serverId: SERVER_ID });

        await updateObject('resolve-1', {
            _syncStatus: SYNC_STATUS.CONFLICT,
            _localConflictData: { thing_id: 'resolve-1', name: 'Local Win', _localRevision: 5 },
            _serverConflictData: { thing_id: 'resolve-1', name: 'Server Win', _serverRevision: 3 },
        }, { skipChangeLog: true });

        await engine.resolveConflictedObject('resolve-1', {
            strategy: 'local_wins',
        });

        const obj = await getObject('resolve-1');
        expect(obj.name).toBe('Local Win');
        expect(obj._syncStatus).toBe(SYNC_STATUS.LOCAL);
        expect(obj._localConflictData).toBeNull();
    });

    it('throws when resolving non-conflicted record', async () => {
        await createObject({
            thing_id: 'not-conflict',
            name: 'Clean',
            type: 3,
            public: 1,
        }, { serverId: SERVER_ID });

        await expect(
            engine.resolveConflictedObject('not-conflict', { strategy: 'local_wins' })
        ).rejects.toThrow('not in conflict state');
    });
});
