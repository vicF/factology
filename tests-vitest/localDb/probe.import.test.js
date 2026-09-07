// TEMP probe (not committed) — verify localImportJson emits progress + speed.
import { describe, it, expect } from 'vitest';
import { getDb, clearAll } from '@factology/engine/localDb/index.js';
import { localImportJson } from '@factology/engine/localDb/localTools.js';
import { onImportProgress } from '@factology/engine/utils/importProgress.js';

describe('probe import', () => {
    it('emits progress and completes fast on a moderately large file', async () => {
        await clearAll();
        const OWNER = 'me-0000-0000-0000-000000000001';
        const N = 12000;
        const L = 36000;
        const things = Array.from({ length: N }, (_, i) => ({
            thing_id: `t-${i}`, name: `Obj ${i}`, type: 3, owner: OWNER, deleted: 0,
        }));
        const links = Array.from({ length: L }, (_, i) => ({
            link_uuid: `lu-${i}`,
            one_thing_id: `t-${i % N}`,
            link_type_id: 'lt-x',
            other_thing_id: `t-${(i * 7) % N}`,
            deleted: 0,
        }));
        const events = [];
        const unsub = onImportProgress(info => events.push(info));
        const t0 = Date.now();
        let res;
        try {
            res = await localImportJson({ things, links });
        } finally {
            unsub();
        }
        const ms = Date.now() - t0;
        expect(res.imported.things).toBe(N);
        expect(res.imported.links).toBe(L);
        expect(events.length).toBeGreaterThan(0);
        const thingsEvents = events.filter(e => e.phase === 'things');
        const linksEvents = events.filter(e => e.phase === 'links');
        expect(thingsEvents.length).toBeGreaterThan(1);
        expect(linksEvents.length).toBeGreaterThan(1);
        // eslint-disable-next-line no-console
        console.log(`PROBE result: ${ms}ms for ${N} things + ${L} links; thingsEv=${thingsEvents.length} linksEv=${linksEvents.length}`);
        await clearAll();
    }, 120000);
});
