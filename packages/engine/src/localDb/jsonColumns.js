// packages/engine/src/localDb/jsonColumns.js
//
// Server jsonb columns travel as JSON *text* in data crossing the wire: a raw
// Postgres jsonb value selected through the query builder comes back as the
// string '{"ru": "Человек", "lang": "en"}' (note Postgres' space after the
// colon), not as a decoded object. Importing such a row verbatim leaves the
// local Dexie row with a string where the UI expects an object — the
// localization helpers (utils/localized.js fieldText/objectName) require an
// object, so names silently fall back to the untranslated plain value (the
// class tree stayed English after switching to Russian).
//
// Every row entering the local DB (and every row already in it, via the Dexie
// v4 upgrade) is normalized through here.

/** jsonb-valued columns of the `things` mirror. */
export const THING_JSON_COLUMNS = [
    'name_translations',
    'description_translations',
    'start_meta',
    'end_meta',
    'data',
];

/** jsonb-valued columns of the `links` mirror. */
export const LINK_JSON_COLUMNS = [
    'link_start_meta',
    'link_end_meta',
    'data',
];

/**
 * Decode one jsonb text value.
 * Non-strings, blanks and anything that is not JSON text are returned as-is,
 * so a genuine scalar stays untouched.
 */
export function decodeJsonColumn(value) {
    if (typeof value !== 'string') return value;
    const text = value.trim();
    if (!text || (text[0] !== '{' && text[0] !== '[')) return value;
    try {
        return JSON.parse(text);
    } catch {
        return value;
    }
}

/**
 * Normalize the jsonb columns of one row in place.
 * @param {object} row
 * @param {string[]} columns
 * @returns {object} the same row (mutated only when something changed)
 */
export function normalizeJsonColumns(row, columns) {
    if (!row || typeof row !== 'object') return row;
    for (const column of columns) {
        if (!(column in row)) continue;
        const decoded = decodeJsonColumn(row[column]);
        if (decoded !== row[column]) row[column] = decoded;
    }
    return row;
}

/** True when any of `columns` still holds undecoded text. */
export function needsJsonDecode(row, columns) {
    if (!row || typeof row !== 'object') return false;
    return columns.some((column) => typeof row[column] === 'string');
}

/**
 * Dexie upgrade callback (schema version 4): heal rows already stored with raw
 * jsonb text, so an install that imported a pre-fix export starts localizing
 * without a re-import.
 *
 * Returns false for rows that need nothing — Dexie's modify() rewrites every
 * row the callback does not explicitly skip, which would re-put a whole large
 * database for no reason.
 * @param {import('dexie').Transaction} tx
 */
export async function upgradeJsonColumns(tx) {
    await tx.table('objects').toCollection().modify(
        (row) => (needsJsonDecode(row, THING_JSON_COLUMNS)
            ? normalizeJsonColumns(row, THING_JSON_COLUMNS)
            : false),
    );
    await tx.table('links').toCollection().modify(
        (row) => (needsJsonDecode(row, LINK_JSON_COLUMNS)
            ? normalizeJsonColumns(row, LINK_JSON_COLUMNS)
            : false),
    );
}
