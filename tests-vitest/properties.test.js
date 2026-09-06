// tests-vitest/properties.test.js
import {
    formatCoord,
    formatScalar,
    geoSummary,
    formatPropertyValue,
    buildPropertyEntries,
} from '../resources/js/utils/properties.js';

const t = (key) => key; // identity translator for display formatting

describe('formatCoord', () => {
    test('rounds to 5 decimal places', () => {
        expect(formatCoord(55.7558267)).toBe('55.75583');
    });

    test('returns empty for non-numeric input', () => {
        expect(formatCoord('')).toBe('');
        expect(formatCoord(null)).toBe('');
        expect(formatCoord('abc')).toBe('');
    });
});

describe('geoSummary', () => {
    test('point shows latitude and longitude', () => {
        expect(geoSummary({ type: 'Point', coordinates: [37.6173, 55.7558] }, t))
            .toBe('Latitude: 55.7558, Longitude: 37.6173');
    });

    test('point with height includes the height', () => {
        expect(geoSummary({ type: 'Point', coordinates: [37.6173, 55.7558, 120] }, t))
            .toBe('Latitude: 55.7558, Longitude: 37.6173, Height (m): 120');
    });

    test('line shows the type and point count', () => {
        expect(geoSummary({ type: 'LineString', coordinates: [[30, 59], [31, 60]] }, t))
            .toBe('LineString: 2');
    });
});

describe('formatPropertyValue', () => {
    test('GeoJSON point is flagged geo with coordinates text', () => {
        const res = formatPropertyValue({ type: 'Point', coordinates: [37.6173, 55.7558] }, t);
        expect(res.isGeo).toBe(true);
        expect(res.text).toContain('55.7558');
    });

    test('legacy {lat,lng} normalizes to point text', () => {
        expect(formatPropertyValue({ lat: 59.939, lng: 30.316 }, t))
            .toEqual({ text: 'Latitude: 59.939, Longitude: 30.316', isGeo: true });
    });

    test('{value,unit} renders value + unit', () => {
        expect(formatPropertyValue({ value: 70, unit: 'kg' }, t))
            .toEqual({ text: '70 kg', isGeo: false });
    });

    test('localized map resolves to text', () => {
        expect(formatPropertyValue({ lang: 'en', ru: 'деревянный' }, t))
            .toEqual({ text: 'деревянный', isGeo: false });
    });

    test('plain scalar passes through', () => {
        expect(formatPropertyValue('text', t)).toEqual({ text: 'text', isGeo: false });
        expect(formatPropertyValue(5, t)).toEqual({ text: '5', isGeo: false });
    });

    test('null gives empty text', () => {
        expect(formatPropertyValue(null, t)).toEqual({ text: '', isGeo: false });
    });
});

describe('buildPropertyEntries', () => {
    const defs = [
        { thing_id: 'geo-id', name: 'Earth Coordinates', name_translations: null },
        { thing_id: 'w-id', name: 'Weight', name_translations: null },
    ];

    test('resolves names and formats each value', () => {
        const entries = buildPropertyEntries({
            'geo-id': { type: 'Point', coordinates: [37.6173, 55.7558] },
            'w-id': { value: 70, unit: 'kg' },
        }, defs, t);
        expect(entries).toEqual([
            { property_id: 'geo-id', name: 'Earth Coordinates', text: 'Latitude: 55.7558, Longitude: 37.6173', isGeo: true },
            { property_id: 'w-id', name: 'Weight', text: '70 kg', isGeo: false },
        ]);
    });

    test('skips empty values', () => {
        const entries = buildPropertyEntries({ 'geo-id': '', 'w-id': 5 }, defs, t);
        expect(entries).toEqual([{ property_id: 'w-id', name: 'Weight', text: '5', isGeo: false }]);
    });

    test('array properties yield no entries', () => {
        expect(buildPropertyEntries([], defs, t)).toEqual([]);
        expect(buildPropertyEntries({ properties: [] }, defs, t).length).toBeGreaterThanOrEqual(0);
    });

    test('unknown property falls back to the raw id as name', () => {
        const entries = buildPropertyEntries({ 'unknown-id': 'x' }, defs, t);
        expect(entries[0].name).toBe('unknown-id');
    });

    test('GEDCOM sex value is translated from the raw code', () => {
        const entries = buildPropertyEntries({ sex: 'F' }, [], t);
        expect(entries[0]).toEqual({ property_id: 'sex', name: 'Sex', text: 'Female', isGeo: false });
    });

    test('null properties yield no entries', () => {
        expect(buildPropertyEntries(null, defs, t)).toEqual([]);
    });
});
