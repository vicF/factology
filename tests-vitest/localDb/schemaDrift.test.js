// tests-vitest/localDb/schemaDrift.test.js
//
// Drift guard between the server (Postgres) schema and the local Dexie schema.
// Laravel migrations in database/migrations/ are the server's source of truth.
// This test asserts that every column Laravel adds to the tables mirrored
// locally (things -> objects, links -> links, photo_media+photo_files -> media)
// is declared in resources/js/localDb/schemaMap.js. When a migration adds a
// column to a mirrored table, this test fails until the column is added to
// schemaMap.js (and handled in the local store code).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { schemaMap } from '@/localDb/schemaMap';

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../database/migrations');
// Some environments (e.g. the frontend-only node container) don't mount the
// Laravel app directory, so the server migrations aren't available there.
const migrationsAvailable = existsSync(MIGRATIONS_DIR);

// Local Dexie store -> server tables it mirrors.
const MIRRORED = {
    objects: ['things'],
    links: ['links'],
    media: ['photo_media', 'photo_files'],
};

// Laravel Blueprint methods that DECLARE a column (as opposed to index, FK and
// chain modifiers such as ->comment(), ->after(), ->nullable(), ->default()).
const COLUMN_TYPES = new Set([
    'bigIncrements', 'smallIncrements', 'mediumIncrements', 'tinyIncrements', 'increments',
    'bigInteger', 'integer', 'mediumInteger', 'smallInteger', 'tinyInteger',
    'unsignedBigInteger', 'unsignedInteger', 'unsignedMediumInteger',
    'unsignedSmallInteger', 'unsignedTinyInteger',
    'decimal', 'unsignedDecimal', 'float', 'double', 'numeric',
    'char', 'string', 'text', 'mediumText', 'longText', 'tinyText', 'enum', 'set',
    'date', 'dateTime', 'dateTimeTz', 'time', 'timeTz', 'timestamp', 'timestampTz', 'year',
    'binary', 'boolean', 'json', 'jsonb', 'uuid', 'ulid', 'ipAddress', 'macAddress',
    'geometry', 'geometryCollection', 'lineString', 'multiLineString', 'multiPoint',
    'multiPolygon', 'point', 'polygon',
    'foreignId', 'foreignIdCascade', 'uuidMorphs',
]);

// Extract the column names declared inside the Blueprint closure of a
// Schema::create('t') / Schema::table('t') block, scoped to `tableName`.
// Uses a brace-depth scan so nested closures are handled correctly.
function extractTableColumns(source, tableName) {
    const cols = [];
    const callRe = /\bSchema::(?:create|table)\(\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = callRe.exec(source)) !== null) {
        if (m[1] !== tableName) continue;

        const openIdx = source.indexOf('function (Blueprint $table)', m.index);
        if (openIdx === -1) continue;
        const braceIdx = source.indexOf('{', openIdx);
        if (braceIdx === -1) continue;

        let depth = 0;
        let endIdx = -1;
        for (let i = braceIdx; i < source.length; i++) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') {
                depth--;
                if (depth === 0) {
                    endIdx = i;
                    break;
                }
            }
        }
        if (endIdx === -1) continue;

        const block = source.slice(braceIdx, endIdx);
        const colRe = /\$table->([a-zA-Z_]+)\(\s*['"]([^'"]+)['"]/g;
        let cm;
        while ((cm = colRe.exec(block)) !== null) {
            if (COLUMN_TYPES.has(cm[1])) cols.push(cm[2]);
        }
    }
    return cols;
}

describe.skipIf(!migrationsAvailable)('Local schema drift against server migrations', () => {
    const migrationFiles = migrationsAvailable
        ? readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.php'))
        : [];

    it('every column Laravel adds to mirrored tables is declared in schemaMap', () => {
        const failures = [];
        for (const [store, tables] of Object.entries(MIRRORED)) {
            const declared = new Set(schemaMap[store].columns);
            for (const table of tables) {
                for (const file of migrationFiles) {
                    const src = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
                    for (const col of extractTableColumns(src, table)) {
                        if (!declared.has(col)) {
                            failures.push(
                                `[${store}] table "${table}": column "${col}" defined in ` +
                                `${file} is not declared in schemaMap.${store}.columns — ` +
                                'add it to resources/js/localDb/schemaMap.js and handle it ' +
                                'in the local store.'
                            );
                        }
                    }
                }
            }
        }
        expect(failures).toEqual([]);
    });

    it('every schemaMap store is registered in MIRRORED with matching tables', () => {
        for (const [store, def] of Object.entries(schemaMap)) {
            expect(MIRRORED[store], `store ${store} missing from MIRRORED`).toBeDefined();
            expect(def.serverTables).toEqual(MIRRORED[store]);
        }
    });
});
