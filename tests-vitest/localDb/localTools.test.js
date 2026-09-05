// tests-vitest/localDb/localTools.test.js
//
// Guards the offline Tools implementations (localTools.js) against the
// semantics of their Laravel counterparts:
//  - consistency check flags dangling links / unclassed objects etc.
//  - consistency delete cascades links and respects ownership
//  - export → import round-trips through the JSON backup format
//  - duplicate finder links likely-same persons

import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, clearAll } from '@/localDb/index';
import { seedLocalDb } from '@/localDb/seeder';
import { UUID } from '@/constants/uuid';
import {
    localConsistencyCheck,
    localConsistencyDelete,
    localExportJson,
    localImportJson,
    localFindDuplicates,
} from '@/localDb/localTools';

const OWNER = UUID.VICTOR_FOKIN;

beforeEach(async () => {
    await clearAll();
    await seedLocalDb();
});

describe('consistency check', () => {
    it('flags links to missing objects', async () => {
        await getDb().links.put({
            link_id: 'link-dangling',
            one_thing_id: UUID.EVERYTHING,
            link_type_id: UUID.LINK_TO_CLASS,
            other_thing_id: 'missing-0000-0000-0000-000000000000',
            deleted: 0,
        });

        const report = await localConsistencyCheck();
        const hit = report.issues.links_to_missing_objects.find(i => i.link_id === 'link-dangling');
        expect(hit).toBeTruthy();
        expect(hit.missing).toContain('other_thing_id');
        expect(report.clean).toBe(false);
    });

    it('flags concrete objects without any class link', async () => {
        const id = crypto.randomUUID();
        await getDb().objects.put({ thing_id: id, name: 'Unclassed', type: UUID.G_THING, owner: OWNER, deleted: 0 });

        const report = await localConsistencyCheck();
        expect(report.issues.objects_without_classes.some(i => i.thing_id === id)).toBe(true);
    });

    it('flags classes detached from the hierarchy', async () => {
        const id = crypto.randomUUID();
        await getDb().objects.put({ thing_id: id, name: 'Rootless class', type: UUID.G_CLASS, owner: OWNER, deleted: 0 });

        const report = await localConsistencyCheck();
        expect(report.issues.classes_without_parent.some(i => i.thing_id === id)).toBe(true);
    });
});

describe('consistency delete', () => {
    it('soft-deletes an owned object and cascades its links', async () => {
        const id = crypto.randomUUID();
        const classLinkId = `link-${crypto.randomUUID()}`;
        await getDb().objects.put({ thing_id: id, name: 'Doomed', type: UUID.G_THING, owner: OWNER, deleted: 0 });
        await getDb().links.put({
            link_id: classLinkId,
            one_thing_id: id,
            link_type_id: UUID.LINK_TO_CLASS,
            other_thing_id: UUID.EVERYTHING,
            deleted: 0,
        });

        const res = await localConsistencyDelete([id], [OWNER]);
        expect(res.deleted).toBe(1);

        const obj = await getDb().objects.get(id);
        expect(obj.deleted).toBe(1);
        const link = await getDb().links.get(classLinkId);
        expect(link.deleted).toBe(1);
    });

    it('will not delete rows owned by someone else', async () => {
        const id = crypto.randomUUID();
        await getDb().objects.put({ thing_id: id, name: 'Other', type: UUID.G_THING, owner: 'someone-else', deleted: 0 });

        const res = await localConsistencyDelete([id], [OWNER]);
        expect(res.deleted).toBe(0);
        const obj = await getDb().objects.get(id);
        expect(obj.deleted).toBe(0);
    });
});

describe('export / import round-trip', () => {
    it('exports only visible non-deleted rows and parses back', async () => {
        const id = crypto.randomUUID();
        await getDb().objects.put({ thing_id: id, name: 'Mine', type: UUID.G_THING, owner: OWNER, deleted: 0 });

        const text = await localExportJson({ visibleOwners: [OWNER], exportedBy: OWNER });
        const parsed = JSON.parse(text);
        expect(parsed.version).toBe(1);
        expect(parsed.data.things.some(t => t.thing_id === id)).toBe(true);
        expect(parsed.stats.things).toBe(parsed.data.things.length);
    });

    it('import overwrites an existing thing (owner preserved)', async () => {
        const id = crypto.randomUUID();
        await getDb().objects.put({ thing_id: id, name: 'Old', type: UUID.G_THING, owner: OWNER, deleted: 0 });

        const result = await localImportJson({
            things: [{ thing_id: id, name: 'New', type: UUID.G_THING, owner: OWNER, deleted: 0 }],
            links: [],
        }, 'overwrite');

        expect(result.imported.things).toBe(1);
        expect((await getDb().objects.get(id)).name).toBe('New');
    });

    it('keep_existing leaves the local row untouched', async () => {
        const id = crypto.randomUUID();
        await getDb().objects.put({ thing_id: id, name: 'Keep me', type: UUID.G_THING, owner: OWNER, deleted: 0 });

        const result = await localImportJson({
            things: [{ thing_id: id, name: 'File copy', type: UUID.G_THING, owner: OWNER, deleted: 0 }],
            links: [],
        }, 'keep_existing');

        expect(result.skipped.things).toBe(1);
        expect((await getDb().objects.get(id)).name).toBe('Keep me');
    });
});

describe('duplicate finder', () => {
    async function addPerson(id, name, sex, fileKey) {
        await getDb().objects.put({
            thing_id: id, name, type: UUID.G_THING, owner: OWNER, deleted: 0,
            data: { properties: { sex } },
            start: '1950-01-01',
        });
        await getDb().links.put({
            link_id: `link-class-${id}`,
            one_thing_id: id,
            link_type_id: UUID.LINK_TO_CLASS,
            other_thing_id: UUID.HUMAN,
            deleted: 0,
        });
        await getDb().links.put({
            link_id: `link-import-${id}`,
            one_thing_id: id,
            link_type_id: UUID.IMPORTED_FROM,
            other_thing_id: id,
            data: { source_external_id: `${fileKey}/@I1@` },
            deleted: 0,
        });
    }

    it('links two likely-same persons from different files', async () => {
        const a = crypto.randomUUID();
        const b = crypto.randomUUID();
        await addPerson(a, 'John /Smith/', 'M', 'fileA');
        await addPerson(b, 'John Smith', 'M', 'fileB');

        const result = await localFindDuplicates([OWNER]);
        expect(result.links_created).toBe(1);
        const pair = result.matches.find(m =>
            (m.thing_id_a === a && m.thing_id_b === b) || (m.thing_id_a === b && m.thing_id_b === a));
        expect(pair).toBeTruthy();
        expect(pair.name_a).toBe('John Smith');
    });

    it('skips same-file namesakes', async () => {
        const a = crypto.randomUUID();
        const b = crypto.randomUUID();
        await addPerson(a, 'John Smith', 'M', 'fileA');
        await addPerson(b, 'John Smith', 'M', 'fileA');

        const result = await localFindDuplicates([OWNER]);
        expect(result.links_created).toBe(0);
    });
});
