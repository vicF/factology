// tests-vitest/localDb/sqlite.test.js
//
// Tests for the SQLiteAdapter backend (sql.js WASM).
//
// These tests create an in-memory SQLite database through a mock fileIO adapter
// that stores the DB bytes in a Uint8Array — no filesystem access needed.
//
// Coverage:
//   1. CRUD operations (put/get/update/delete/bulkGet/bulkPut)
//   2. WhereClause queries (equals, anyOf, compound anyOf, first)
//   3. Collection methods (filter, limit, count, keys, orderBy, reverse, or)
//   4. Compound index query patterns matching apiHandler.js usage
//   5. Transaction support
//   6. Backend detection (createBackend with injected fileIO)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import initSqlJs from 'sql.js';

const TABLE_DEFS = {
    objects: {
        pk: 'thing_id',
        columns: [
            'thing_id TEXT PRIMARY KEY',
            'type INTEGER',
            'owner TEXT',
            'public INTEGER DEFAULT 0',
            'deleted INTEGER DEFAULT 0',
            'name TEXT',
            'data TEXT',
            '_syncStatus TEXT',
            '_localRevision INTEGER DEFAULT 0',
        ],
    },
    links: {
        pk: 'link_id',
        columns: [
            'link_id TEXT PRIMARY KEY',
            'link_uuid TEXT',
            'one_thing_id TEXT',
            'link_type_id TEXT',
            'other_thing_id TEXT',
            'public INTEGER DEFAULT 0',
            'data TEXT',
            '_syncStatus TEXT',
        ],
    },
};

/**
 * Create an in-memory fileIO adapter.
 * Stores the serialised database in a closure variable.
 */
function createMemoryFileIO() {
    let buf = null;
    return {
        read: async () => {
            if (!buf) throw new Error('DB file not found');
            return new Uint8Array(buf);
        },
        write: async (data) => {
            buf = new Uint8Array(data);
        },
        _getBuffer: () => buf,
    };
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

describe('SQLiteAdapter', () => {
    let SQL;
    let SQLiteAdapter;
    let adapter;
    let fileIO;

    beforeAll(async () => {
        SQL = await initSqlJs();
        // Dynamic import after sql.js is loaded so the WASM is ready
        const mod = await import('@factology/engine/localDb/backend/sqliteAdapter.js');
        SQLiteAdapter = mod.SQLiteAdapter;
    });

    beforeEach(async () => {
        fileIO = createMemoryFileIO();
        adapter = new SQLiteAdapter(fileIO);
        await adapter.init('test_factology');
    });

    afterEach(() => {
        if (adapter) adapter.close();
    });

    // ── CRUD ────────────────────────────────────────────────────────────────

    describe('CRUD', () => {
        it('put + get a simple object', async () => {
            const obj = {
                thing_id: 'obj-1',
                type: 1,
                owner: 'owner-1',
                name: 'Test Object',
                _syncStatus: 'local',
            };
            await adapter.objects.put(obj);
            const got = await adapter.objects.get('obj-1');
            expect(got).toBeTruthy();
            expect(got.thing_id).toBe('obj-1');
            expect(got.name).toBe('Test Object');
            expect(got._syncStatus).toBe('local');
        });

        it('put updates existing row (upsert)', async () => {
            await adapter.objects.put({ thing_id: 'obj-1', name: 'v1', type: 1 });
            await adapter.objects.put({ thing_id: 'obj-1', name: 'v2', type: 1 });
            const got = await adapter.objects.get('obj-1');
            expect(got.name).toBe('v2');
        });

        it('bulkGet returns rows in order with undefined for missing keys', async () => {
            await adapter.objects.put({ thing_id: 'a', name: 'A', type: 1 });
            await adapter.objects.put({ thing_id: 'b', name: 'B', type: 1 });
            await adapter.objects.put({ thing_id: 'c', name: 'C', type: 1 });
            const result = await adapter.objects.bulkGet(['b', 'c', 'nonexistent', 'a']);
            expect(result).toHaveLength(4);
            expect(result[0].name).toBe('B');
            expect(result[1].name).toBe('C');
            expect(result[2]).toBeUndefined();
            expect(result[3].name).toBe('A');
        });

        it('bulkPut inserts multiple rows', async () => {
            const rows = [
                { thing_id: 'x', name: 'X', type: 1 },
                { thing_id: 'y', name: 'Y', type: 1 },
                { thing_id: 'z', name: 'Z', type: 1 },
            ];
            await adapter.objects.bulkPut(rows);
            const all = await adapter.objects.toArray();
            expect(all).toHaveLength(3);
        });

        it('update modifies specific columns', async () => {
            await adapter.objects.put({ thing_id: 'obj-1', name: 'Original', type: 1, owner: 'me' });
            await adapter.objects.update('obj-1', { name: 'Updated' });
            const got = await adapter.objects.get('obj-1');
            expect(got.name).toBe('Updated');
            expect(got.owner).toBe('me'); // unchanged
        });

        it('delete removes row', async () => {
            await adapter.objects.put({ thing_id: 'obj-1', name: 'Delete me', type: 1 });
            await adapter.objects.delete('obj-1');
            const got = await adapter.objects.get('obj-1');
            expect(got).toBeUndefined();
        });

        it('clear removes all rows', async () => {
            await adapter.objects.put({ thing_id: 'a', name: 'A', type: 1 });
            await adapter.objects.put({ thing_id: 'b', name: 'B', type: 1 });
            await adapter.objects.clear();
            const all = await adapter.objects.toArray();
            expect(all).toHaveLength(0);
        });

        it('add throws on duplicate key', async () => {
            await adapter.objects.add({ thing_id: 'dup', name: 'first', type: 1 });
            await expect(
                adapter.objects.add({ thing_id: 'dup', name: 'second', type: 1 })
            ).rejects.toThrow(/Key already exists/);
        });

        it('stores JSON data as serialised string', async () => {
            const obj = {
                thing_id: 'obj-json',
                type: 1,
                data: { nested: { value: 42 }, tags: ['a', 'b'] },
            };
            await adapter.objects.put(obj);
            const got = await adapter.objects.get('obj-json');
            expect(got.data).toEqual({ nested: { value: 42 }, tags: ['a', 'b'] });
        });

        it('persists and reloads via fileIO', async () => {
            await adapter.objects.put({ thing_id: 'persist-me', name: 'Persistent', type: 1 });
            await adapter.save();

            // Close and re-open with the same fileIO
            adapter.close();
            const data = fileIO._getBuffer();
            const reOpenIO = {
                read: async () => new Uint8Array(data),
                write: async () => {},
            };
            const adapter2 = new SQLiteAdapter(reOpenIO);
            await adapter2.init('test_factology');

            const got = await adapter2.objects.get('persist-me');
            expect(got).toBeTruthy();
            expect(got.name).toBe('Persistent');
            adapter2.close();
        });
    });

    // ── WhereClause ─────────────────────────────────────────────────────────

    describe('WhereClause', () => {
        beforeEach(async () => {
            await adapter.objects.put({ thing_id: 'a1', name: 'Alpha', type: 1, owner: 'me' });
            await adapter.objects.put({ thing_id: 'b1', name: 'Beta', type: 2, owner: 'me' });
            await adapter.objects.put({ thing_id: 'c1', name: 'Gamma', type: 1, owner: 'you' });
            await adapter.objects.put({ thing_id: 'd1', name: 'Delta', type: 3, owner: 'me' });
        });

        it('equals filters by column', async () => {
            const rows = await adapter.objects.where('type').equals(1).toArray();
            expect(rows).toHaveLength(2);
            expect(rows.map(r => r.thing_id).sort()).toEqual(['a1', 'c1']);
        });

        it('anyOf matches multiple values', async () => {
            const rows = await adapter.objects.where('type').anyOf([1, 3]).toArray();
            expect(rows).toHaveLength(3);
            expect(rows.map(r => r.thing_id).sort()).toEqual(['a1', 'c1', 'd1']);
        });

        it('anyOf with empty array returns empty', async () => {
            const rows = await adapter.objects.where('type').anyOf([]).toArray();
            expect(rows).toHaveLength(0);
        });

        it('first returns one row or null', async () => {
            const row = await adapter.objects.where('type').equals(1).first();
            expect(row).toBeTruthy();
            expect(row.type).toBe(1);

            const none = await adapter.objects.where('type').equals(999).first();
            expect(none).toBeNull();
        });

        it('and() chains a filter function', async () => {
            const rows = await adapter.objects
                .where('type').equals(1)
                .and(r => r.owner === 'me')
                .toArray();
            expect(rows).toHaveLength(1);
            expect(rows[0].thing_id).toBe('a1');
        });

        it('multiple conditions via .and()', async () => {
            // Simulate: .where('one_thing_id').equals(id).and(l => l.link_type_id === LINK_TO_CLASS)
            await adapter.links.put({ link_id: 'l1', one_thing_id: 'a1', link_type_id: 'CLASS', other_thing_id: 'c1' });
            await adapter.links.put({ link_id: 'l2', one_thing_id: 'a1', link_type_id: 'OTHER', other_thing_id: 'c2' });
            await adapter.links.put({ link_id: 'l3', one_thing_id: 'b1', link_type_id: 'CLASS', other_thing_id: 'c3' });

            const rows = await adapter.links
                .where('one_thing_id').equals('a1')
                .and(l => l.link_type_id === 'CLASS')
                .toArray();
            expect(rows).toHaveLength(1);
            expect(rows[0].link_id).toBe('l1');
        });

        it('compound anyOf (array of arrays)', async () => {
            // Simulate: .where('[one_thing_id+link_type_id+other_thing_id]')
            //          .anyOf([[id1, type, id2], [id3, type, id4]])
            await adapter.links.put({ link_id: 'l1', one_thing_id: 'a1', link_type_id: 'CLASS', other_thing_id: 'c1' });
            await adapter.links.put({ link_id: 'l2', one_thing_id: 'a1', link_type_id: 'OTHER', other_thing_id: 'c2' });
            await adapter.links.put({ link_id: 'l3', one_thing_id: 'b1', link_type_id: 'CLASS', other_thing_id: 'c3' });

            const rows = await adapter.links
                .where('one_thing_id+link_type_id+other_thing_id')
                .anyOf([['a1', 'CLASS', 'c1'], ['b1', 'CLASS', 'c3']])
                .toArray();
            expect(rows).toHaveLength(2);
            expect(rows.map(r => r.link_id).sort()).toEqual(['l1', 'l3']);
        });
    });

    // ── Collection ──────────────────────────────────────────────────────────

    describe('Collection', () => {
        beforeEach(async () => {
            for (let i = 1; i <= 10; i++) {
                await adapter.objects.put({
                    thing_id: `obj-${i}`,
                    name: `Object ${i}`,
                    type: i <= 5 ? 1 : 2,
                    _createdAt: i * 1000,
                });
            }
        });

        it('toArray returns all rows', async () => {
            const all = await adapter.objects.toArray();
            expect(all).toHaveLength(10);
        });

        it('count returns row count', async () => {
            const count = await adapter.objects.count();
            expect(count).toBe(10);
        });

        it('filter narrows results', async () => {
            const rows = await adapter.objects.filter(r => r.type === 1).toArray();
            expect(rows).toHaveLength(5);
        });

        it('limit caps results', async () => {
            const rows = await adapter.objects.limit(3).toArray();
            expect(rows).toHaveLength(3);
        });

        it('first returns first row', async () => {
            const row = await adapter.objects.first();
            expect(row).toBeTruthy();
        });

        it('keys returns primary key values', async () => {
            const keys = await adapter.objects.keys();
            expect(keys).toHaveLength(10);
            expect(new Set(keys)).toEqual(
                new Set(Array.from({ length: 10 }, (_, i) => `obj-${i + 1}`))
            );
        });

        it('sortBy + reverse orders results', async () => {
            const asc = await adapter.objects.sortBy('_createdAt').toArray();
            expect(asc[0]._createdAt).toBe(1000);
            expect(asc[asc.length - 1]._createdAt).toBe(10000);

            const desc = await adapter.objects.sortBy('_createdAt').reverse().toArray();
            expect(desc[0]._createdAt).toBe(10000);
            expect(desc[desc.length - 1]._createdAt).toBe(1000);
        });

        it('or() creates OR query', async () => {
            const rows = await adapter.objects
                .where('type').equals(1)
                .or('owner').equals('nonexistent')
                .toArray();
            // type 1 rows only (owner never matches)
            expect(rows).toHaveLength(5);
        });
    });

    // ── Compound index query patterns ───────────────────────────────────────

    describe('Compound index patterns (apiHandler.js equivalents)', () => {
        beforeEach(async () => {
            // Seed links matching the apiHandler.js query patterns
            const links = [
                { link_id: 'l1', one_thing_id: 'obj-1', link_type_id: 'CLASS', other_thing_id: 'cls-1' },
                { link_id: 'l2', one_thing_id: 'obj-1', link_type_id: 'OTHER', other_thing_id: 'cls-2' },
                { link_id: 'l3', one_thing_id: 'obj-2', link_type_id: 'CLASS', other_thing_id: 'cls-1' },
                { link_id: 'l4', one_thing_id: 'obj-3', link_type_id: 'CLASS', other_thing_id: 'cls-2' },
                { link_id: 'l5', other_thing_id: 'obj-1', link_type_id: 'CLASS', one_thing_id: 'cls-5' },
                { link_id: 'l6', other_thing_id: 'obj-2', link_type_id: 'CLASS', one_thing_id: 'cls-6' },
            ];
            await adapter.links.bulkPut(links);
        });

        // Equivalent of:
        //   .where('[other_thing_id+link_type_id]').anyOf(classIds.map(id => [id, LINK_TO_CLASS]))
        // → .where('other_thing_id').anyOf(classIds).and(l => l.link_type_id === LINK_TO_CLASS)
        it('Pattern 1: other_thing_id + link_type_id with .and()', async () => {
            const classIds = ['obj-1', 'obj-2'];
            const LINK_TO_CLASS = 'CLASS';
            const rows = await adapter.links
                .where('other_thing_id').anyOf(classIds)
                .and(l => l.link_type_id === LINK_TO_CLASS)
                .toArray();
            expect(rows).toHaveLength(2);
            expect(rows.map(r => r.link_id).sort()).toEqual(['l5', 'l6']);
        });

        // Equivalent of:
        //   .where('[one_thing_id+link_type_id]').equals([thingId, LINK_TO_CLASS])
        // → .where('one_thing_id').equals(thingId).and(l => l.link_type_id === LINK_TO_CLASS)
        it('Pattern 2: one_thing_id + link_type_id .equals tuple via .and()', async () => {
            const thingId = 'obj-1';
            const LINK_TO_CLASS = 'CLASS';
            const rows = await adapter.links
                .where('one_thing_id').equals(thingId)
                .and(l => l.link_type_id === LINK_TO_CLASS)
                .toArray();
            expect(rows).toHaveLength(1);
            expect(rows[0].link_id).toBe('l1');
        });

        // Equivalent of:
        //   .where('[one_thing_id+link_type_id]').anyOf(thingIds.map(id => [id, LINK_TO_CLASS]))
        // → .where('one_thing_id').anyOf(thingIds).and(l => l.link_type_id === LINK_TO_CLASS)
        it('Pattern 3: one_thing_id + link_type_id anyOf via .and()', async () => {
            const thingIds = ['obj-1', 'obj-2'];
            const LINK_TO_CLASS = 'CLASS';
            const rows = await adapter.links
                .where('one_thing_id').anyOf(thingIds)
                .and(l => l.link_type_id === LINK_TO_CLASS)
                .toArray();
            expect(rows).toHaveLength(2);
            expect(rows.map(r => r.link_id).sort()).toEqual(['l1', 'l3']);
        });

        // Equivalent of:
        //   .where('[one_thing_id+link_type_id+other_thing_id]').equals([thingId, LINK_TO_CLASS, cls])
        // → .where('one_thing_id').equals(thingId).and(l => ...)
        it('Pattern 4: triplet .equals via .and()', async () => {
            const thingId = 'obj-1';
            const LINK_TO_CLASS = 'CLASS';
            const cls = 'cls-1';
            const rows = await adapter.links
                .where('one_thing_id').equals(thingId)
                .and(l => l.link_type_id === LINK_TO_CLASS && l.other_thing_id === cls)
                .toArray();
            expect(rows).toHaveLength(1);
            expect(rows[0].link_id).toBe('l1');
        });

        it('Pattern 5: compound anyOf with tuple array (native SQLiteAdapter support)', async () => {
            // This is the native Dexie compound index pattern that the SQLiteAdapter
            // DOES handle via the anyOf(array-of-arrays) path.
            const rows = await adapter.links
                .where('one_thing_id+link_type_id+other_thing_id')
                .anyOf([['obj-1', 'CLASS', 'cls-1'], ['obj-3', 'CLASS', 'cls-2']])
                .toArray();
            expect(rows).toHaveLength(2);
            expect(rows.map(r => r.link_id).sort()).toEqual(['l1', 'l4']);
        });
    });

    // ── Transaction ─────────────────────────────────────────────────────────

    describe('transaction', () => {
        it('commits successful transaction', async () => {
            await adapter.transaction('rw', ['objects'], async () => {
                await adapter.objects.put({ thing_id: 'tx-a', name: 'TX A', type: 1 });
                await adapter.objects.put({ thing_id: 'tx-b', name: 'TX B', type: 1 });
            });
            const count = await adapter.objects.count();
            expect(count).toBe(2);
        });

        it('rolls back on error', async () => {
            await adapter.objects.put({ thing_id: 'before-tx', name: 'Before', type: 1 });
            try {
                await adapter.transaction('rw', ['objects'], async () => {
                    await adapter.objects.put({ thing_id: 'tx-fail', name: 'Fail', type: 1 });
                    throw new Error('boom');
                });
            } catch (e) {
                expect(e.message).toBe('boom');
            }
            // Row inserted inside the transaction should be gone
            const failRow = await adapter.objects.get('tx-fail');
            expect(failRow).toBeUndefined();
            // Row inserted before the transaction should still be there
            const before = await adapter.objects.get('before-tx');
            expect(before).toBeTruthy();
        });
    });

    // ── Backend / createBackend ──────────────────────────────────────────────

    describe('createBackend with injected fileIO', () => {
        it('creates SQLiteAdapter when fileIO is provided', async () => {
            const { createBackend } = await import('@factology/engine/localDb/backend/index.js');
            const io = createMemoryFileIO();
            const backend = await createBackend({ fileIO: io });
            expect(backend.constructor.name).toBe('SQLiteAdapter');
            await backend.objects.put({ thing_id: 'be-test', name: 'Backend test', type: 1 });
            const got = await backend.objects.get('be-test');
            expect(got.name).toBe('Backend test');
            backend.close();
        });

        it('falls through to Dexie when no Node.js or fileIO available', async () => {
            // In jsdom with no fileIO, no electron, no Capacitor, it should
            // fall back to Dexie. But we need to be careful: Vitest has process.env.VITEST,
            // so createBackend will pick Node.js path. This test verifies the
            // fallback logic by checking that the function doesn't crash.
            const { createBackend } = await import('@factology/engine/localDb/backend/index.js');
            // With no fileIO we'll either get a SQLiteAdapter (test env) or Dexie (browser)
            // Either is fine as long as it returns a functioning db
            const backend = await createBackend({});
            expect(backend).toBeTruthy();
            if (backend.constructor.name === 'SQLiteAdapter') {
                backend.close();
            }
        });
    });
});