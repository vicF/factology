// Guards the jsonb-text decode: exports from the server carry `name_translations`
// & friends as raw Postgres jsonb text ('{"lang": "en", "ru": "Человек"}'). A row
// imported verbatim leaves a string where the localization helpers need an object,
// so class/object names stay English after switching the UI language.

import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import {
    decodeJsonColumn,
    normalizeJsonColumns,
    upgradeJsonColumns,
    THING_JSON_COLUMNS,
} from '@factology/engine/localDb/jsonColumns.js';
import { createDatabase } from '@factology/engine/localDb/schema.js';
import { importExportData } from '@factology/engine/localDb/importData.js';
import { getDb, clearAll } from '@factology/engine/localDb/index.js';
import { fieldText } from '../../resources/js/utils/localized.js';

describe('jsonb text decoding', () => {
    it('parses Postgres jsonb text into an object', () => {
        expect(decodeJsonColumn('{"lang": "en", "ru": "Человек"}'))
            .toEqual({ lang: 'en', ru: 'Человек' });
    });

    it('leaves non-JSON values untouched', () => {
        expect(decodeJsonColumn('Human')).toBe('Human');
        expect(decodeJsonColumn('')).toBe('');
        expect(decodeJsonColumn(null)).toBe(null);
        expect(decodeJsonColumn({ ru: 'Человек' })).toEqual({ ru: 'Человек' });
        // Malformed JSON text must not throw.
        expect(decodeJsonColumn('{oops')).toBe('{oops');
    });

    it('normalizes only the jsonb columns of a row', () => {
        const row = normalizeJsonColumns({
            name: 'Human',
            name_translations: '{"ru":"Человек"}',
            description: 'A person',
        }, THING_JSON_COLUMNS);

        expect(row.name_translations).toEqual({ ru: 'Человек' });
        expect(row.name).toBe('Human');
        expect(row.description).toBe('A person');
    });
});

describe('importing a legacy export (jsonb columns as strings)', () => {
    const OWNER = 'owner-1';

    beforeEach(async () => {
        await clearAll();
    });

    it('stores translations as objects so names localize', async () => {
        const report = await importExportData({
            data: {
                things: [{
                    thing_id: 'thing-class-1',
                    name: 'Human',
                    type: 2,
                    owner: OWNER,
                    public: 1,
                    // Exactly what the server export used to emit.
                    name_translations: '{"lang": "en", "ru": "Человек"}',
                }],
                links: [],
            },
        }, OWNER);

        expect(report.imported).toBe(1);

        const stored = await getDb().objects.get('thing-class-1');
        expect(stored.name_translations).toEqual({ lang: 'en', ru: 'Человек' });
        expect(fieldText(stored.name, stored.name_translations, 'ru')).toBe('Человек');
    });
});

describe('Dexie v4 upgrade heals already-imported rows', () => {
    // A throwaway database so the real one (and the engine's open singleton)
    // is never touched; the same upgrade callback the schema wires at v4 runs
    // against it via the identical version chain.
    const PROBE_DB = 'factology_local_upgrade_probe';
    const stores = { objects: '&thing_id', links: '&link_id' };

    beforeEach(async () => {
        await clearAll();
        await Dexie.delete(PROBE_DB);
    });

    it('converts string jsonb columns on objects and links in place', async () => {
        // Simulate an install written before the fix (schema version 1).
        const old = new Dexie(PROBE_DB);
        old.version(1).stores(stores);
        await old.open();
        await old.objects.put({
            thing_id: 't1',
            name: 'Human',
            name_translations: '{"lang": "en", "ru": "Человек"}',
        });
        await old.links.put({ link_id: 'l1', link_start_meta: '{"era": "ce"}' });
        old.close();

        // Re-open at v4 → the upgrade runs.
        const healed = new Dexie(PROBE_DB);
        healed.version(1).stores(stores);
        healed.version(4).stores(stores).upgrade(upgradeJsonColumns);
        await healed.open();

        expect((await healed.objects.get('t1')).name_translations)
            .toEqual({ lang: 'en', ru: 'Человек' });
        expect((await healed.links.get('l1')).link_start_meta)
            .toEqual({ era: 'ce' });

        healed.close();
    });

    it('keeps the production schema at version 5', async () => {
        const db = createDatabase();
        await db.open();
        expect(db.verno).toBe(5);
        db.close();
    });
});
