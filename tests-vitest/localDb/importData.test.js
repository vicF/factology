// tests-vitest/localDb/importData.test.js

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { importExportData } from '@/localDb/importData';
import { clearAll, getDb, getObject, SYNC_STATUS } from '@/localDb/index';
import { getLinkByUuid } from '@/localDb/links';

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
});
