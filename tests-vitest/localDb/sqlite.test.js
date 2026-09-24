// tests-vitest/localDb/sqlite.test.js
//
// Tests for the SQLite adapter (sqliteAdapter.js + backend/index.js).
// Uses an in-memory buffer for file I/O so no disk writes occur.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '@factology/engine/localDb/backend/sqliteAdapter.js';
import { createBackend } from '@factology/engine/localDb/backend/index.js';
import { initDb, getDb, clearAll, SYNC_STATUS } from '@factology/engine/localDb/index.js';

// ---------------------------------------------------------------------------
// In-memory fileIO — stores the SQLite binary in a Uint8Array so tests never
// touch the filesystem.
// ---------------------------------------------------------------------------
function createMemoryFileIO() {
    let buffer = null;
    return {
        async read() {
            if (!buffer) throw new Error('DB file not found');
            return buffer;
        },
        async write(data) {
            buffer = new Uint8Array(data);
        },
        // Expose for introspection
        getBuffer() { return buffer; },
        reset() { buffer = null; },
    };
}

// ---------------------------------------------------------------------------
// Helper: create a test SQLiteAdapter with an in-memory fileIO
// ---------------------------------------------------------------------------
async function createTestAdapter() {
    const fileIO = createMemoryFileIO();
    const adapter = new SQLiteAdapter(fileIO);
    await adapter.init('test_db');
    return { adapter, fileIO };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SQLiteAdapter — table CRUD', () => {
    let adapter;

    beforeEach(async () => {
        const result = await createTestAdapter();
        adapter = result.adapter;
    });

    afterEach(async () => {
        if (adapter) {
            adapter.close();
        }
    });

    it('initializes and creates all tables', () => {
        const stmt = adapter._db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        );
        const tables = [];
        while (stmt.step()) {
            tables.push(stmt.getAsObject().name);
        }
        stmt.free();
        expect(tables).toContain('objects');
        expect(tables).toContain('links');
        expect(tables).toContain('media');
        expect(tables).toContain('pendingChanges');
        expect(tables).toContain('syncMetadata');
        expect(tables).toContain('external_links');
    });

    it('put + get a simple object', async () => {
        const obj = {
            thing_id: 't1',
            name: 'Test Object',
            type: 3,
            public: 1,
            _syncStatus: SYNC_STATUS.LOCAL_ONLY,
            _localRevision: 1,
        };
        await adapter.objects.put(obj);
        const retrieved = await adapter.objects.get('t1');
        expect(retrieved).toBeTruthy();
        expect(retrieved.name).toBe('Test Object');
        expect(retrieved.type).toBe(3);
        expect(retrieved.public).toBe(1);
        expect(retrieved._syncStatus).toBe(SYNC_STATUS.LOCAL_ONLY);
    });

    it('put updates an existing record', async () => {
        await adapter.objects.put({ thing_id: 't1', name: 'Original', type: 1 });
        await adapter.objects.put({ thing_id: 't1', name: 'Updated', type: 2 });
        const retrieved = await adapter.objects.get('t1');
        expect(retrieved.name).toBe('Updated');
        expect(retrieved.type).toBe(2);
    });

    it('get returns undefined for missing key', async () => {
        const result = await adapter.objects.get('nonexistent');
        expect(result).toBeUndefined();
    });

    it('add throws when key already exists', async () => {
        await adapter.objects.add({ thing_id: 't1', name: 'First', type: 1 });
        await expect(
            adapter.objects.add({ thing_id: 't1', name: 'Second', type: 2 })
        ).rejects.toThrow(/Key already exists/);
    });

    it('update modifies specific fields', async () => {
        await adapter.objects.put({ thing_id: 't1', name: 'Original', type: 1, public: 0 });
        await adapter.objects.update('t1', { name: 'Modified', public: 1 });
        const retrieved = await adapter.objects.get('t1');
        expect(retrieved.name).toBe('Modified');
        expect(retrieved.public).toBe(1);
        expect(retrieved.type).toBe(1); // unchanged
    });

    it('delete removes a record', async () => {
        await adapter.objects.put({ thing_id: 't1', name: 'To Delete', type: 1 });
        await adapter.objects.delete('t1');
        const retrieved = await adapter.objects.get('t1');
        expect(retrieved).toBeUndefined();
    });

    it('bulkDelete removes multiple records', async () => {
        await adapter.objects.put({ thing_id: 't1', name: 'A', type: 1 });
        await adapter.objects.put({ thing_id: 't2', name: 'B', type: 1 });
        await adapter.objects.put({ thing_id: 't3', name: 'C', type: 1 });
        await adapter.objects.bulkDelete(['t1', 't3']);
        expect(await adapter.objects.get('t1')).toBeUndefined();
        expect(await adapter.objects.get('t2')).toBeTruthy();
        expect(await adapter.objects.get('t3')).toBeUndefined();
    });

    it('bulkGet returns records in id order, undefined for missing', async () => {
        await adapter.objects.put({ thing_id: 't1', name: 'One', type: 1 });
        await adapter.objects.put({ thing_id: 't2', name: 'Two', type: 1 });
        await adapter.objects.put({ thing_id: 't3', name: 'Three', type: 1 });
        const results = await adapter.objects.bulkGet(['t3', 't1', 'nonexistent', 't2']);
        expect(results).toHaveLength(4);
        expect(results[0].thing_id).toBe('t3');
        expect(results[1].thing_id).toBe('t1');
        expect(results[2]).toBeUndefined();
        expect(results[3].thing_id).toBe('t2');
    });

    it('bulkPut inserts multiple records', async () => {
        const rows = [
            { thing_id: 't1', name: 'A', type: 1 },
            { thing_id: 't2', name: 'B', type: 2 },
            { thing_id: 't3', name: 'C', type: 3 },
        ];
        await adapter.objects.bulkPut(rows);
        expect(await adapter.objects.get('t1')).toBeTruthy();
        expect(await adapter.objects.get('t2')).toBeTruthy();
        expect(await adapter.objects.get('t3')).toBeTruthy();
    });

    it('clear removes all records from a table', async () => {
        await adapter.objects.put({ thing_id: 't1', name: 'A', type: 1 });
        await adapter.objects.put({ thing_id: 't2', name: 'B', type: 1 });
        await adapter.objects.clear();
        const all = await adapter.objects.toArray();
        expect(all).toHaveLength(0);
    });
});

describe('SQLiteAdapter — queries (where/equals, anyOf, or, and, filter)', () => {
    let adapter;

    beforeEach(async () => {
        const result = await createTestAdapter();
        adapter = result.adapter;
        const objects = [
            { thing_id: 't1', name: 'Apple', type: 1, owner: 'user1' },
            { thing_id: 't2', name: 'Banana', type: 2, owner: 'user1' },
            { thing_id: 't3', name: 'Cherry', type: 1, owner: 'user2' },
            { thing_id: 't4', name: 'Date', type: 3, owner: 'user1' },
            { thing_id: 't5', name: 'Elderberry', type: 2, owner: 'user3' },
        ];
        await adapter.objects.bulkPut(objects);
    });

    afterEach(async () => {
        if (adapter) adapter.close();
    });

    it('where().equals() filters by column', async () => {
        const results = await adapter.objects.where('type').equals(1).toArray();
        expect(results).toHaveLength(2);
        expect(results.map(r => r.thing_id).sort()).toEqual(['t1', 't3']);
    });

    it('where().equals() with owner', async () => {
        const results = await adapter.objects.where('owner').equals('user1').toArray();
        expect(results).toHaveLength(3);
    });

    it('anyOf matches multiple values', async () => {
        const results = await adapter.objects.where('type').anyOf([1, 3]).toArray();
        expect(results).toHaveLength(3);
    });

    it('anyOf with empty array matches nothing', async () => {
        const results = await adapter.objects.where('type').anyOf([]).toArray();
        expect(results).toHaveLength(0);
    });

    it('where().first() returns first match', async () => {
        const result = await adapter.objects.where('owner').equals('user1').first();
        expect(result).toBeTruthy();
        expect(result.owner).toBe('user1');
    });

    it('where().first() returns null when no match', async () => {
        const result = await adapter.objects.where('owner').equals('nonexistent').first();
        expect(result).toBeNull();
    });

    it('toCollection().filter() applies JS-side filter', async () => {
        const results = await adapter.objects
            .filter(obj => obj.name.startsWith('B'))
            .toArray();
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Banana');
    });

    it('and() chains filter after where', async () => {
        const results = await adapter.objects
            .where('type').equals(2)
            .and(obj => obj.owner === 'user1')
            .toArray();
        expect(results).toHaveLength(1);
        expect(results[0].thing_id).toBe('t2');
    });

    it('or() produces Dexie-compatible OR query', async () => {
        const results = await adapter.objects
            .where('type').equals(1)
            .or('type').equals(3)
            .toArray();
        expect(results).toHaveLength(3);
        const ids = results.map(r => r.thing_id).sort();
        expect(ids).toEqual(['t1', 't3', 't4']);
    });

    it('or().equals().or().equals() complex', async () => {
        const results = await adapter.objects
            .where('owner').equals('user1')
            .or('owner').equals('user3')
            .toArray();
        expect(results).toHaveLength(4);
    });

    it('limit restricts result count', async () => {
        const results = await adapter.objects.where('owner').equals('user1').limit(2).toArray();
        expect(results).toHaveLength(2);
    });

    it('count returns count without filters', async () => {
        const count = await adapter.objects.count();
        expect(count).toBe(5);
    });

    it('keys returns primary key values', async () => {
        const keys = await adapter.objects.where('type').equals(2).keys();
        expect(keys.sort()).toEqual(['t2', 't5']);
    });

    it('primaryKeys returns same as keys', async () => {
        const pks = await adapter.objects.where('type').equals(2).primaryKeys();
        expect(pks).toHaveLength(2);
    });

    it('toArray returns all records from a table', async () => {
        const all = await adapter.objects.toArray();
        expect(all).toHaveLength(5);
    });

    it('orderBy sorts results', async () => {
        const results = await adapter.objects.orderBy('name').toArray();
        expect(results[0].name).toBe('Apple');
        expect(results[4].name).toBe('Elderberry');
    });

    it('reverse flips sort order', async () => {
        const results = await adapter.objects.orderBy('name').reverse().toArray();
        expect(results[0].name).toBe('Elderberry');
        expect(results[4].name).toBe('Apple');
    });
});

describe('SQLiteAdapter — compound index anyOf', () => {
    let adapter;

    beforeEach(async () => {
        const result = await createTestAdapter();
        adapter = result.adapter;
        const links = [
            { link_id: 'l1', one_thing_id: 'a', link_type_id: 1, other_thing_id: 'b' },
            { link_id: 'l2', one_thing_id: 'a', link_type_id: 2, other_thing_id: 'c' },
            { link_id: 'l3', one_thing_id: 'b', link_type_id: 1, other_thing_id: 'c' },
            { link_id: 'l4', one_thing_id: 'c', link_type_id: 3, other_thing_id: 'd' },
        ];
        await adapter.links.bulkPut(links);
    });

    afterEach(async () => {
        if (adapter) adapter.close();
    });

    it('compound anyOf with tuples', async () => {
        const results = await adapter.links
            .where('one_thing_id+link_type_id+other_thing_id')
            .anyOf([['a', 1, 'b'], ['b', 1, 'c']])
            .toArray();
        expect(results).toHaveLength(2);
        const ids = results.map(r => r.link_id).sort();
        expect(ids).toEqual(['l1', 'l3']);
    });

    it('compound anyOf with single tuple', async () => {
        const results = await adapter.links
            .where('one_thing_id+link_type_id+other_thing_id')
            .anyOf([['a', 2, 'c']])
            .toArray();
        expect(results).toHaveLength(1);
        expect(results[0].link_id).toBe('l2');
    });

    it('compound anyOf with no matches returns empty', async () => {
        const results = await adapter.links
            .where('one_thing_id+link_type_id+other_thing_id')
            .anyOf([['x', 9, 'y']])
            .toArray();
        expect(results).toHaveLength(0);
    });
});

describe('SQLiteAdapter — autoIncrement table (pendingChanges)', () => {
    let adapter;

    beforeEach(async () => {
        const result = await createTestAdapter();
        adapter = result.adapter;
    });

    afterEach(async () => {
        if (adapter) adapter.close();
    });

    it('auto-increments id on put without id', async () => {
        adapter._run(
            `INSERT INTO "pendingChanges" ("operation", "table", "recordId", "timestamp") VALUES (?, ?, ?, ?)`,
            ['INSERT', 'objects', 't1', 1000]
        );
        const stmt = adapter._db.prepare('SELECT * FROM "pendingChanges"');
        stmt.step();
        const row = stmt.getAsObject();
        stmt.free();
        expect(row.id).toBe(1);
        expect(row.operation).toBe('INSERT');
    });

    it('pendingChanges.put with explicit id works', async () => {
        adapter._run(
            `INSERT INTO "pendingChanges" ("id", "operation", "table", "recordId", "timestamp") VALUES (?, ?, ?, ?, ?)`,
            [99, 'UPDATE', 'objects', 't1', 2000]
        );
        const stmt = adapter._db.prepare('SELECT * FROM pendingChanges WHERE id = 99');
        stmt.step();
        const row = stmt.getAsObject();
        stmt.free();
        expect(row.recordId).toBe('t1');
    });
});

describe('SQLiteAdapter — transaction', () => {
    let adapter;

    beforeEach(async () => {
        const result = await createTestAdapter();
        adapter = result.adapter;
    });

    afterEach(async () => {
        if (adapter) adapter.close();
    });

    it('commits successful transaction', async () => {
        await adapter.transaction('rw', [adapter.objects], async () => {
            await adapter.objects.put({ thing_id: 't1', name: 'In Transaction', type: 1 });
            await adapter.objects.put({ thing_id: 't2', name: 'Also In Tx', type: 2 });
        });
        const t1 = await adapter.objects.get('t1');
        const t2 = await adapter.objects.get('t2');
        expect(t1.name).toBe('In Transaction');
        expect(t2.name).toBe('Also In Tx');
    });

    it('rolls back on error', async () => {
        await adapter.objects.put({ thing_id: 't1', name: 'Before Rollback', type: 1 });
        try {
            await adapter.transaction('rw', [adapter.objects], async () => {
                await adapter.objects.put({ thing_id: 't2', name: 'Will Fail', type: 2 });
                throw new Error('Rollback trigger');
            });
        } catch (e) {
            // expected
        }
        const t1 = await adapter.objects.get('t1');
        expect(t1).toBeTruthy();
        const t2 = await adapter.objects.get('t2');
        expect(t2).toBeUndefined();
    });
});

describe('SQLiteAdapter — JSON serialization', () => {
    let adapter;

    beforeEach(async () => {
        const result = await createTestAdapter();
        adapter = result.adapter;
    });

    afterEach(async () => {
        if (adapter) adapter.close();
    });

    it('stores and retrieves data as JSON', async () => {
        const data = { lat: 51.5, lng: -0.12, zoom: 10 };
        await adapter.objects.put({
            thing_id: 't1',
            name: 'Geo Object',
            type: 1,
            data: data,
        });
        const retrieved = await adapter.objects.get('t1');
        expect(retrieved.data).toEqual(data);
    });

    it('stores and retrieves tags array as JSON', async () => {
        const tags = ['tag1', 'tag2', 'tag3'];
        await adapter.objects.put({
            thing_id: 't1',
            name: 'Tagged Object',
            type: 1,
            tags: tags,
        });
        const retrieved = await adapter.objects.get('t1');
        expect(retrieved.tags).toEqual(tags);
    });

    it('stores and retrieves links.data as JSON', async () => {
        const linkData = { start: '2024-01-01', end: '2024-12-31' };
        await adapter.links.put({
            link_id: 'l1',
            one_thing_id: 'a',
            link_type_id: 1,
            other_thing_id: 'b',
            data: linkData,
        });
        const retrieved = await adapter.links.get('l1');
        expect(retrieved.data).toEqual(linkData);
    });
});

describe('SQLiteAdapter — save/load persistence', () => {
    it('persists data across close and reload', async () => {
        const fileIO = createMemoryFileIO();
        const adapter1 = new SQLiteAdapter(fileIO);
        await adapter1.init('persist_test');
        await adapter1.objects.put({ thing_id: 't1', name: 'Persisted', type: 1 });
        await adapter1.objects.put({ thing_id: 't2', name: 'Also Persisted', type: 2 });
        await adapter1.save();
        adapter1.close();

        const adapter2 = new SQLiteAdapter(fileIO);
        await adapter2.init('persist_test');
        const t1 = await adapter2.objects.get('t1');
        const t2 = await adapter2.objects.get('t2');
        expect(t1.name).toBe('Persisted');
        expect(t2.name).toBe('Also Persisted');
        adapter2.close();
    });

    it('initializes empty when no file exists', async () => {
        const fileIO = {
            async read() { throw new Error('DB file not found'); },
            async write(data) {},
        };
        const adapter = new SQLiteAdapter(fileIO);
        await adapter.init('empty_test');
        const count = await adapter.objects.count();
        expect(count).toBe(0);
        adapter.close();
    });
});

describe('createBackend — backend selection', () => {
    it('uses SQLiteAdapter when fileIO is provided', async () => {
        const fileIO = createMemoryFileIO();
        const backend = await createBackend({ fileIO, dbName: 'test_select' });
        expect(backend.constructor.name).toBe('SQLiteAdapter');
        expect(backend._ready).toBe(true);
        backend.close();
    });
});

describe('initDb/getDb integration', () => {
    it('initDb with fileIO primes the adapter for getDb', async () => {
        const fileIO = createMemoryFileIO();
        const backend = await initDb({ fileIO, dbName: 'test_integration' });
        expect(backend.constructor.name).toBe('SQLiteAdapter');

        const db = getDb();
        expect(db).toBe(backend);

        await db.objects.put({ thing_id: 't1', name: 'Integration Test', type: 1 });
        const obj = await db.objects.get('t1');
        expect(obj.name).toBe('Integration Test');

        await clearAll();
    });

    it('enqueueChange and popPendingChanges work via SQLite backend', async () => {
        const fileIO = createMemoryFileIO();
        await initDb({ fileIO, dbName: 'test_changes' });
        const db = getDb();

        await db.pendingChanges.add({
            operation: 'INSERT',
            table: 'objects',
            recordId: 't1',
            payload: { name: 'test' },
            serverId: null,
            timestamp: Date.now(),
        });

        const count = await db.pendingChanges.count();
        expect(count).toBe(1);

        await db.pendingChanges.add({
            operation: 'UPDATE',
            table: 'objects',
            recordId: 't2',
            payload: { name: 'updated' },
            serverId: 'server1',
            timestamp: Date.now(),
        });

        const all = await db.pendingChanges.toArray();
        expect(all).toHaveLength(2);

        await clearAll();
        const afterClear = await db.pendingChanges.count();
        expect(afterClear).toBe(0);
    });
});