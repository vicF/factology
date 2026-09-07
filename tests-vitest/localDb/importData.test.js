// tests-vitest/localDb/importData.test.js

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { importExportData } from '@factology/engine/localDb/importData.js';
import { onImportProgress } from '@factology/engine/utils/importProgress.js';
import { clearAll, getDb, getObject, SYNC_STATUS } from '@factology/engine/localDb/index.js';
import { getLinkByUuid } from '@factology/engine/localDb/links.js';
import { seedLocalDb } from '@factology/engine/localDb/seeder.js';
import { UUID } from '@factology/engine/constants/uuid.js';

const MY_ID = 'me-0000-0000-0000-000000000001';

describe('LocalDB — importExportData (owner-integrity rules)', () => {
    beforeEach(async () => {
        await clearAll();
    });

    afterEach(async () => {
        await clearAll();
    });

    function exportFile(things, links) {
        return { version: 1, data: { things, links: links || [] } };
    }

    it('imports objects owned by the identity as LOCAL_ONLY', async () => {
        const report = await importExportData(exportFile([
            { thing_id: 'obj-1', name: 'Mine', type: 3, owner: MY_ID, public: 1 },
        ]), MY_ID);

        expect(report.imported).toBe(1);
        const obj = await getObject('obj-1');
        expect(obj.name).toBe('Mine');
        expect(obj._syncStatus).toBe(SYNC_STATUS.LOCAL_ONLY);
    });

    it('skips objects not owned by the identity', async () => {
        const report = await importExportData(exportFile([
            { thing_id: 'obj-other', name: 'Not Mine', type: 3, owner: 'someone-else', public: 1 },
        ]), MY_ID);

        expect(report.imported).toBe(0);
        expect(report.skippedNotYours).toBe(1);
        expect(await getObject('obj-other')).toBeNull();
    });

    it('reports and ignores an owner mismatch on an existing local object', async () => {
        const db = getDb();
        await db.objects.put({ thing_id: 'obj-1', name: 'Local', type: 3, owner: MY_ID, public: 1 });

        const report = await importExportData(exportFile([
            { thing_id: 'obj-1', name: 'File claims', type: 3, owner: 'someone-else', public: 1 },
        ]), MY_ID);

        expect(report.errors.length).toBe(1);
        const obj = await getObject('obj-1');
        expect(obj.name).toBe('Local'); // untouched
    });

    it('skips existing objects whose owner matches', async () => {
        const db = getDb();
        await db.objects.put({ thing_id: 'obj-1', name: 'Local', type: 3, owner: MY_ID, public: 1 });

        const report = await importExportData(exportFile([
            { thing_id: 'obj-1', name: 'Same', type: 3, owner: MY_ID, public: 1 },
        ]), MY_ID);

        expect(report.skippedExisting).toBe(1);
        expect(await getObject('obj-1')).toBeTruthy();
    });

    it('imports links between imported things, preserving link_uuid and minting link_id', async () => {
        const report = await importExportData(exportFile([
            { thing_id: 'a', name: 'A', type: 3, owner: MY_ID, public: 1 },
            { thing_id: 'b', name: 'B', type: 3, owner: MY_ID, public: 1 },
        ], [
            { link_uuid: 'link-u-1', one_thing_id: 'a', link_type_id: 't1', other_thing_id: 'b', public: true },
        ]), MY_ID);

        expect(report.imported).toBe(2);
        expect(report.importedLinks).toBe(1);

        const link = await getLinkByUuid('link-u-1');
        expect(link).toBeTruthy();
        expect(link.link_id).toMatch(/^link-/);
    });

    it('does not import links whose endpoints are absent', async () => {
        const report = await importExportData(exportFile([], [
            { link_uuid: 'link-u-2', one_thing_id: 'missing-a', link_type_id: 't1', other_thing_id: 'missing-b', public: true },
        ]), MY_ID);

        expect(report.importedLinks).toBe(0);
    });

    it('rejects a non-export file', async () => {
        await expect(importExportData({ foo: 'bar' }, MY_ID)).rejects.toThrow(/Not a valid Factology export/);
    });

    it('does not duplicate class-hierarchy edges that exist as seed rows', async () => {
        // Seed rows have no link_uuid, so a naive import of the same edge from
        // a web export would insert a second row → every class appears twice in
        // the class tree. The import must instead adopt the canonical link_uuid
        // onto the existing seed row.
        await seedLocalDb();
        const db = getDb();

        const seedLinks = await db.links
            .where('link_type_id')
            .equals(UUID.LINK_TO_PARENT)
            .toArray();

        // Simulate a server export file carrying the same edges with uuids.
        const fileLinks = seedLinks.map((l, i) => ({
            link_uuid: `11111111-2222-3333-4444-${String(i).padStart(12, '0')}`,
            one_thing_id: l.one_thing_id,
            link_type_id: l.link_type_id,
            other_thing_id: l.other_thing_id,
            public: true,
        }));

        const report = await importExportData(
            exportFile([], fileLinks),
            MY_ID,
        );

        // All edges already present locally → nothing inserted.
        expect(report.importedLinks).toBe(0);

        const after = await db.links
            .where('link_type_id')
            .equals(UUID.LINK_TO_PARENT)
            .toArray();
        expect(after.length).toBe(seedLinks.length);

        // Existing seed rows adopted the canonical uuids (no dup rows).
        const withUuid = after.filter(l => l.link_uuid);
        expect(withUuid.length).toBe(seedLinks.length);

        // Re-import is still a no-op (uuid dedupe kicks in now).
        const report2 = await importExportData(
            exportFile([], fileLinks),
            MY_ID,
        );
        expect(report2.importedLinks).toBe(0);
    });

    it('posts things and links progress while importing', async () => {
        const events = [];
        const unsubscribe = onImportProgress(info => events.push(info));
        try {
            await importExportData(exportFile([
                { thing_id: 'a', name: 'A', type: 3, owner: MY_ID, public: 1 },
                { thing_id: 'b', name: 'B', type: 3, owner: MY_ID, public: 1 },
            ], [
                { link_uuid: 'link-u-progress', one_thing_id: 'a', link_type_id: 't1', other_thing_id: 'b', public: true },
            ]), MY_ID);
        } finally {
            unsubscribe();
        }

        expect(events.length).toBeGreaterThan(0);
        const thingsEvents = events.filter(e => e.phase === 'things');
        const linksEvents = events.filter(e => e.phase === 'links');
        expect(thingsEvents.length).toBeGreaterThan(0);
        expect(linksEvents.length).toBeGreaterThan(0);
        const thingsEnd = thingsEvents[thingsEvents.length - 1];
        const linksEnd = linksEvents[linksEvents.length - 1];
        expect(thingsEnd.done).toBe(thingsEnd.total);
        expect(thingsEnd.percent).toBe(100);
        expect(linksEnd.done).toBe(linksEnd.total);
        expect(linksEnd.percent).toBe(100);
    });
});
