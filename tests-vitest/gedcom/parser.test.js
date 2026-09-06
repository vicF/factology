// tests-vitest/gedcom/parser.test.js
//
// Guards the pure GEDCOM line parser (gedcom/gedcomParser.js) against the
// behaviour of the server GedcomParser it mirrors.

import { describe, it, expect } from 'vitest';
import {
    parse,
    parseHeadMetadata,
    findChild,
    findChildren,
    childValue,
    getFullValue,
    normalizeGedcomDate,
    convertGedcomDateToIso,
    extractPlaceName,
    extractPlaceCoordinates,
} from '@/gedcom/gedcomParser';

const SAMPLE = [
    '0 HEAD',
    '1 SOUR Древо Жизни',
    '2 NAME Древо Жизни',
    '2 VERS 6.1.9',
    '1 DATE 22 AUG 2026',
    '1 _DBGUID 12345678-1234-1234-1234-123456789abc',
    '1 SUBM @U1@',
    '0 @U1@ SUBM',
    '1 NAME Victor',
    '0 @I1@ INDI',
    '1 NAME John /Smith/',
    '1 SEX M',
    '1 BIRT',
    '2 DATE 12 APR 1856',
    '2 PLAC London, England',
    '1 NOTE Some note',
    '2 CONT continued line',
    '2 CONC joined',
    '1 DEAT',
    '2 DATE AFT 1900',
    '0 @F1@ FAM',
    '1 HUSB @I1@',
    '1 CHIL @I2@',
    '0 @S1@ SOUR',
    '1 TITL A book about Smiths',
    '1 AUTH Jane Doe',
    '0 TRLR',
].join('\n');

describe('parse', () => {
    it('returns level-0 data records, skipping HEAD/SUBM/TRLR', () => {
        const records = parse(SAMPLE);
        expect(records.map((r) => r.tag)).toEqual(['INDI', 'FAM', 'SOUR']);
    });

    it('carries xref ids and nests children', () => {
        const records = parse(SAMPLE);
        const indi = records[0];
        expect(indi.id).toBe('@I1@');
        expect(indi.value).toBe('');
        expect(indi.children.map((c) => c.tag)).toContain('NAME');
        expect(indi.children.map((c) => c.tag)).toContain('BIRT');
        const birt = findChild(indi, 'BIRT');
        expect(childValue(birt, 'DATE')).toBe('12 APR 1856');
        expect(childValue(birt, 'PLAC')).toBe('London, England');
    });

    it('concatenates CONT with newline and CONC without separator', () => {
        const records = parse(SAMPLE);
        const note = findChild(records[0], 'NOTE');
        expect(getFullValue(note)).toBe('Some note\ncontinued linejoined');
    });

    it('tolerates CRLF and blank lines', () => {
        const text = SAMPLE.replace(/\n/g, '\r\n');
        const records = parse(text);
        expect(records.length).toBeGreaterThanOrEqual(3);
    });
});

describe('parseHeadMetadata', () => {
    it('extracts source name, fullname, date and _DBGUID', () => {
        const meta = parseHeadMetadata(SAMPLE);
        expect(meta.source_name).toBe('Древо Жизни');
        expect(meta.source_fullname).toBe('Древо Жизни');
        expect(meta.export_date).toBe('22 AUG 2026');
        expect(meta.dbguid).toBe('12345678-1234-1234-1234-123456789abc');
    });
});

describe('date normalization', () => {
    it('converts month words to ISO forms', () => {
        expect(convertGedcomDateToIso('12 APR 1856')).toBe('1856-04-12');
        expect(convertGedcomDateToIso('JAN 1850')).toBe('1850-01');
        expect(convertGedcomDateToIso('1856')).toBe('1856');
        expect(convertGedcomDateToIso('12 ЯНВ 1856')).toBe('1856-01-12');
    });

    it('maps GEDCOM qualifiers to FlexibleDate words', () => {
        expect(normalizeGedcomDate('ABT 1900')).toBe('about 1900');
        expect(normalizeGedcomDate('BEF 12 APR 1856')).toBe('before 1856-04-12');
        expect(normalizeGedcomDate('AFT 1900')).toBe('after 1900');
        expect(normalizeGedcomDate('BET 1900 AND 1910')).toBe('between 1900 and 1910');
        expect(normalizeGedcomDate('FROM 1900 TO 1910')).toBe('between 1900 and 1910');
        expect(normalizeGedcomDate('EST 1900')).toBe('about 1900');
        expect(normalizeGedcomDate('INT 1900 (census says so)')).toBe('about 1900 (census says so)');
        expect(normalizeGedcomDate('1856')).toBe('1856');
        expect(normalizeGedcomDate(null)).toBeNull();
    });
});

describe('place helpers', () => {
    it('extracts the most specific place name', () => {
        const node = { tag: 'PLAC', value: 'London, England', children: [] };
        expect(extractPlaceName(node)).toBe('London');
    });

    it('extracts and signs coordinates from MAP LATI/LONG', () => {
        const node = {
            tag: 'PLAC', value: 'Moscow, Russia', children: [
                { tag: 'MAP', value: '', children: [
                    { tag: 'LATI', value: 'N55.7558', children: [] },
                    { tag: 'LONG', value: 'E37.6173', children: [] },
                ] },
            ],
        };
        const coords = extractPlaceCoordinates(node);
        expect(coords).toEqual({ lat: 55.7558, lng: 37.6173 });
    });
});
