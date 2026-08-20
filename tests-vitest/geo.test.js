// tests-vitest/geo.test.js
import {
    extractCoordinates,
    isGeoPropertyName,
    isGeoJsonGeometry,
    isLegacyLatLng,
    buildMapFeatures,
    latLngToPoint,
    stripBlankCoords,
    appendVertex,
    closePolygon,
} from '../resources/js/utils/geo.js';

describe('extractCoordinates', () => {
    test('returns [] for null / empty / non-object input', () => {
        expect(extractCoordinates(null)).toEqual([]);
        expect(extractCoordinates(undefined)).toEqual([]);
        expect(extractCoordinates({})).toEqual([]);
        expect(extractCoordinates('nope')).toEqual([]);
    });

    test('extracts a GeoJSON Point', () => {
        const out = extractCoordinates({
            'prop-1': { type: 'Point', coordinates: [37.6173, 55.7558] },
        });
        expect(out).toEqual([
            { geometry: { type: 'Point', coordinates: [37.6173, 55.7558] }, property_id: 'prop-1' },
        ]);
    });

    test('extracts lines/polygons and heights', () => {
        const out = extractCoordinates({
            line: { type: 'LineString', coordinates: [[37.6, 55.7], [37.7, 55.8]] },
            poly: { type: 'Polygon', coordinates: [[[37.6, 55.7], [37.7, 55.8], [37.6, 55.7]]] },
            pt: { type: 'Point', coordinates: [37.6, 55.7, 120.5] },
        });
        expect(out).toHaveLength(3);
        expect(out[0].geometry.type).toBe('LineString');
        expect(out[1].geometry.type).toBe('Polygon');
        expect(out[2].geometry.coordinates).toEqual([37.6, 55.7, 120.5]);
    });

    test('normalizes legacy { lat, lng } to a Point', () => {
        const out = extractCoordinates({
            'prop-1': { lat: 55.7558, lng: 37.6173 },
        });
        expect(out).toEqual([
            { geometry: { type: 'Point', coordinates: [37.6173, 55.7558] }, property_id: 'prop-1' },
        ]);
    });

    test('skips invalid values', () => {
        expect(extractCoordinates({ p: { coordinates: [1, 2] } })).toEqual([]); // no type
        expect(extractCoordinates({ p: { type: 'Circle', coordinates: [1, 2] } })).toEqual([]);
        expect(extractCoordinates({ p: { type: 'Point' } })).toEqual([]); // no coordinates
        expect(extractCoordinates({ p: { type: 'Point', coordinates: [181, 0] } })).toEqual([]);
        expect(extractCoordinates({ p: { type: 'Point', coordinates: [0, 91] } })).toEqual([]);
        expect(extractCoordinates({ p: { lat: 91, lng: 0 } })).toEqual([]);
        expect(extractCoordinates({ p: { lat: 1 } })).toEqual([]);
        expect(extractCoordinates({ p: 'Moscow' })).toEqual([]);
    });
});

describe('isGeoJsonGeometry', () => {
    test('accepts valid geometries', () => {
        expect(isGeoJsonGeometry({ type: 'Point', coordinates: [37.6, 55.7] })).toBe(true);
        expect(isGeoJsonGeometry({ type: 'LineString', coordinates: [[37.6, 55.7], [37.7, 55.8]] })).toBe(true);
        expect(isGeoJsonGeometry({ type: 'Point', coordinates: [37.6, 55.7, 120] })).toBe(true);
    });

    test('rejects invalid geometries', () => {
        expect(isGeoJsonGeometry(null)).toBe(false);
        expect(isGeoJsonGeometry({})).toBe(false);
        expect(isGeoJsonGeometry({ type: 'Point' })).toBe(false);
        expect(isGeoJsonGeometry({ type: 'Circle', coordinates: [1, 2] })).toBe(false);
        expect(isGeoJsonGeometry({ type: 'Point', coordinates: [181, 0] })).toBe(false);
        expect(isGeoJsonGeometry({ type: 'Point', coordinates: [] })).toBe(false);
        expect(isGeoJsonGeometry({ lat: 1, lng: 2 })).toBe(false); // legacy, not GeoJSON
    });
});

describe('isLegacyLatLng', () => {
    test('accepts a valid { lat, lng } pair', () => {
        expect(isLegacyLatLng({ lat: 55.7558, lng: 37.6173 })).toBe(true);
    });

    test('rejects invalid pairs', () => {
        expect(isLegacyLatLng({ lat: 91, lng: 0 })).toBe(false);
        expect(isLegacyLatLng({ lat: 1 })).toBe(false);
        expect(isLegacyLatLng(null)).toBe(false);
        expect(isLegacyLatLng({ type: 'Point', coordinates: [1, 2] })).toBe(false);
    });
});

describe('isGeoPropertyName', () => {
    test('matches common geo names in en and ru', () => {
        expect(isGeoPropertyName('Earth Coordinates')).toBe(true);
        expect(isGeoPropertyName('Гео-координаты')).toBe(true);
        expect(isGeoPropertyName('Координаты')).toBe(true);
        expect(isGeoPropertyName('Location')).toBe(true);
    });

    test('rejects unrelated names', () => {
        expect(isGeoPropertyName('Weight')).toBe(false);
        expect(isGeoPropertyName('')).toBe(false);
    });
});

describe('latLngToPoint', () => {
    test('converts a pair', () => {
        expect(latLngToPoint({ lat: 55.7558, lng: 37.6173 })).toEqual({ type: 'Point', coordinates: [37.6173, 55.7558] });
        expect(latLngToPoint({ lat: '', lng: '' })).toEqual({ type: 'Point', coordinates: [null, null] });
    });
});

describe('buildMapFeatures', () => {
    test('returns [] for null / object without coordinates', () => {
        expect(buildMapFeatures(null)).toEqual([]);
        expect(buildMapFeatures({ thing_id: 'x', links: [] })).toEqual([]);
    });

    test('adds a root feature from the server-side geo field', () => {
        const features = buildMapFeatures({
            thing_id: 'root',
            name: 'Root',
            geo: [{ geometry: { type: 'Point', coordinates: [20, 10] }, property_id: 'p1' }],
            links: [],
        });
        expect(features).toHaveLength(1);
        expect(features[0]).toMatchObject({
            thing_id: 'root',
            geometry: { type: 'Point', coordinates: [20, 10] },
            isRoot: true,
        });
    });

    test('falls back to data.properties for the root', () => {
        const features = buildMapFeatures({
            thing_id: 'root',
            name: 'Root',
            data: { properties: { p1: { lat: 11, lng: 21 } } },
            links: [],
        });
        expect(features[0]).toMatchObject({
            thing_id: 'root',
            geometry: { type: 'Point', coordinates: [21, 11] },
            isRoot: true,
        });
    });

    test('adds related features from target.geo and dedupes by thing_id', () => {
        const features = buildMapFeatures({
            thing_id: 'root',
            name: 'Root',
            geo: [{ geometry: { type: 'Point', coordinates: [0, 0] }, property_id: 'p' }],
            links: [
                { target: { thing_id: 'b', name: 'Bravo', geo: [{ geometry: { type: 'Point', coordinates: [1, 1] }, property_id: 'p' }] } },
                { target: { thing_id: 'c', name: 'Charlie', geo: [{ geometry: { type: 'LineString', coordinates: [[2, 2], [3, 3]] }, property_id: 'p' }] } },
                { target: { thing_id: 'b', name: 'Bravo again', geo: [{ geometry: { type: 'Point', coordinates: [9, 9] }, property_id: 'p' }] } },
            ],
        });
        expect(features).toHaveLength(3); // root + b + c
        const related = features.filter((f) => !f.isRoot);
        expect(related.map((f) => f.thing_id).sort()).toEqual(['b', 'c']);
        expect(related.find((f) => f.thing_id === 'b').geometry.coordinates).toEqual([1, 1]); // first kept
        expect(related.find((f) => f.thing_id === 'c').geometry.type).toBe('LineString');
    });

    test('walks nested target.links', () => {
        const features = buildMapFeatures({
            thing_id: 'root',
            name: 'Root',
            links: [
                {
                    target: {
                        thing_id: 'b',
                        name: 'Bravo',
                        geo: [{ geometry: { type: 'Point', coordinates: [1, 1] }, property_id: 'p' }],
                        links: [
                            { target: { thing_id: 'c', name: 'Charlie', geo: [{ geometry: { type: 'Point', coordinates: [2, 2] }, property_id: 'p' }] } },
                        ],
                    },
                },
            ],
        });
        expect(features.map((f) => f.thing_id).sort()).toEqual(['b', 'c']);
    });
});

// ── Click-to-build vertex editing ──────────────────────────────────────────

describe('stripBlankCoords', () => {
    test('drops placeholder tuples', () => {
        expect(stripBlankCoords([[null, null], [1, 2], ['', '']])).toEqual([[1, 2]]);
    });

    test('handles null / non-array input', () => {
        expect(stripBlankCoords(null)).toEqual([]);
        expect(stripBlankCoords([undefined, 'nope'])).toEqual([]);
    });
});

describe('appendVertex', () => {
    test('point is replaced by the clicked position', () => {
        expect(appendVertex({ type: 'Point', coordinates: [0, 0] }, 30.5, 59.9))
            .toEqual({ type: 'Point', coordinates: [30.5, 59.9] });
    });

    test('line appends a vertex and strips template blanks', () => {
        expect(appendVertex({ type: 'LineString', coordinates: [[null, null], [30, 59]] }, 31, 60))
            .toEqual({ type: 'LineString', coordinates: [[30, 59], [31, 60]] });
    });

    test('polygon appends to the first ring, starting one when empty', () => {
        const fromTemplate = appendVertex({ type: 'Polygon', coordinates: [[[null, null], [null, null], [null, null], [null, null]]] }, 30, 59);
        expect(fromTemplate).toEqual({ type: 'Polygon', coordinates: [[[30, 59]]] });
        const second = appendVertex(fromTemplate, 31, 60);
        expect(second).toEqual({ type: 'Polygon', coordinates: [[[30, 59], [31, 60]]] });
    });

    test('multi-point appends a vertex', () => {
        expect(appendVertex({ type: 'MultiPoint', coordinates: [[30, 59]] }, 31, 60))
            .toEqual({ type: 'MultiPoint', coordinates: [[30, 59], [31, 60]] });
    });

    test('multi-line / multi-polygon are not click-buildable', () => {
        expect(appendVertex({ type: 'MultiLineString', coordinates: [] }, 30, 59)).toBeNull();
        expect(appendVertex({ type: 'MultiPolygon', coordinates: [] }, 30, 59)).toBeNull();
        expect(appendVertex(null, 30, 59)).toBeNull();
    });
});

describe('closePolygon', () => {
    test('closes an open ring by duplicating the first vertex', () => {
        const closed = closePolygon({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] });
        expect(closed).toEqual({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] });
    });

    test('leaves an already-closed ring alone', () => {
        const geom = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
        expect(closePolygon(geom)).toBe(geom);
    });

    test('leaves degenerate rings alone', () => {
        const geom = { type: 'Polygon', coordinates: [[[null, null], [null, null]]] };
        expect(closePolygon(geom)).toBe(geom);
    });
});
