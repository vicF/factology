// resources/js/utils/geo.js
//
// Detection/extraction of "Coordinates" stored as object properties.
//
// Coordinates live in an object's `data.properties` map as a GeoJSON geometry:
// `{ <propertyThingId>: { type, coordinates } }` where `coordinates` use
// GeoJSON order `[lng, lat]` with an optional 3rd element for height
// (e.g. `{ type: 'Point', coordinates: [37.6173, 55.7558] }`).
//
// Detection is purely by value shape — no hardcoded property id is required.
// Legacy `{ lat, lng }` values are still recognized and normalized to a Point.
// Mirrors app/Services/GeoProperties.php.

export const GEO_TYPES = [
    'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon',
];
export const LAT_RANGE = [-90, 90];
export const LNG_RANGE = [-180, 180];

// Number() would coerce null/''/true to 0; treat them as invalid to stay
// consistent with the PHP side (is_numeric rejects them too).
const toFiniteNumber = (value) => {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return NaN;
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
};

/** Recursively validate a GeoJSON `coordinates` array (leaf tuples `[lng, lat, ?height]`). */
const coordsValid = (coords) => {
    if (!Array.isArray(coords) || coords.length === 0) return false;
    const first = coords[0];
    if (typeof first === 'number') {
        const lng = toFiniteNumber(coords[0]);
        const lat = toFiniteNumber(coords[1]);
        return Number.isFinite(lng) && Number.isFinite(lat)
            && lng >= LNG_RANGE[0] && lng <= LNG_RANGE[1]
            && lat >= LAT_RANGE[0] && lat <= LAT_RANGE[1];
    }
    return coords.every((c) => coordsValid(c));
};

/** True when `value` looks like a valid GeoJSON geometry object. */
export function isGeoJsonGeometry(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value)
        && GEO_TYPES.includes(value.type)
        && Array.isArray(value.coordinates)
        && coordsValid(value.coordinates);
}

/** True when `value` is a legacy `{ lat, lng }` coordinate pair (in range). */
export function isLegacyLatLng(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!('lat' in value) || !('lng' in value)) return false;
    const lat = toFiniteNumber(value.lat);
    const lng = toFiniteNumber(value.lng);
    return Number.isFinite(lat) && Number.isFinite(lng)
        && lat >= LAT_RANGE[0] && lat <= LAT_RANGE[1]
        && lng >= LNG_RANGE[0] && lng <= LNG_RANGE[1];
}

const GEO_NAME_RE = /coordin|координат|гео|location|местоположени|расположени/i;

/** True when a property's name suggests it carries geographic coordinates. */
export function isGeoPropertyName(name) {
    return GEO_NAME_RE.test(String(name || ''));
}

/** Normalize a property value into a GeoJSON geometry, or null when it is not one. */
function geometryOf(value) {
    if (isGeoJsonGeometry(value)) return value;
    if (isLegacyLatLng(value)) {
        return { type: 'Point', coordinates: [Number(value.lng), Number(value.lat)] };
    }
    return null;
}

/**
 * Given a `data.properties` map (property thing_id => value), return the list
 * of coordinate entries `[{ geometry, property_id }]` (GeoJSON geometries).
 */
export function extractCoordinates(propertiesMap) {
    if (!propertiesMap || typeof propertiesMap !== 'object') return [];
    const out = [];
    for (const [propId, value] of Object.entries(propertiesMap)) {
        const geometry = geometryOf(value);
        if (geometry) out.push({ geometry, property_id: propId });
    }
    return out;
}

/**
 * Collect map features from an object payload (root `object` + nested related
 * `link.target`s). Returns `[{ thing_id, name, name_translations, isRoot, geometry }]`,
 * deduped by thing_id (root first). Each node's geo comes from the server-side
 * `geo` field when present, else from `data.properties` via `extractCoordinates`.
 */
export function buildMapFeatures(object) {
    if (!object) return [];
    const out = [];
    const seen = new Set();
    const add = (thing, geos, isRoot) => {
        if (!thing || !thing.thing_id || seen.has(thing.thing_id)) return;
        if (!Array.isArray(geos) || geos.length === 0) return;
        seen.add(thing.thing_id);
        out.push({
            thing_id: thing.thing_id,
            name: thing.name ?? null,
            name_translations: thing.name_translations ?? null,
            isRoot,
            geometry: geos[0].geometry,
        });
    };
    const rootGeo = Array.isArray(object.geo) && object.geo.length
        ? object.geo
        : extractCoordinates(object.data?.properties);
    add(object, rootGeo, true);
    const walk = (links) => {
        if (!Array.isArray(links)) return;
        for (const link of links) {
            const target = link?.target;
            if (!target) continue;
            const geo = Array.isArray(target.geo) && target.geo.length
                ? target.geo
                : extractCoordinates(target.data?.properties);
            add(target, geo, false);
            if (target.links && target.links.length) walk(target.links);
        }
    };
    walk(object.links);
    return out;
}

/** A GeoJSON Point from a { lat, lng } pair; empty values become [null, null]. */
export function latLngToPoint({ lat, lng } = {}) {
    const latNum = toFiniteNumber(lat);
    const lngNum = toFiniteNumber(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
        return { type: 'Point', coordinates: [null, null] };
    }
    return { type: 'Point', coordinates: [lngNum, latNum] };
}

// ── Click-to-build vertex editing (edit form) ──────────────────────────────

/** Drop placeholder tuples (both values null/''/undefined) from a coordinate list. */
export function stripBlankCoords(coords) {
    return (coords || []).filter(
        (c) => Array.isArray(c) && c[0] != null && c[1] != null && c[0] !== '' && c[1] !== ''
    );
}

/**
 * Append a clicked [lng, lat] vertex to a click-buildable geometry.
 * Point → replaced by the clicked point; MultiPoint/LineString → vertex appended;
 * Polygon → vertex appended to the first ring (starting one if empty).
 * MultiLineString/MultiPolygon → null (not click-buildable). Returns a new geometry.
 */
export function appendVertex(geometry, lng, lat) {
    if (!geometry || typeof geometry !== 'object') return null;
    const type = geometry.type;
    if (type === 'Point') return { type, coordinates: [lng, lat] };
    if (type === 'MultiPoint' || type === 'LineString') {
        return { type, coordinates: [...stripBlankCoords(geometry.coordinates), [lng, lat]] };
    }
    if (type === 'Polygon') {
        const ring = stripBlankCoords(geometry.coordinates?.[0]);
        return { type, coordinates: [ring.length ? [...ring, [lng, lat]] : [[lng, lat]]] };
    }
    return null;
}

/**
 * Close a polygon's first ring by duplicating its first vertex (GeoJSON rings
 * are closed). Returns the same geometry when there is nothing to close.
 */
export function closePolygon(geometry) {
    if (!geometry || geometry.type !== 'Polygon') return geometry;
    const ring = stripBlankCoords(geometry.coordinates?.[0]);
    if (ring.length < 3) return geometry;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) return geometry;
    return { type: 'Polygon', coordinates: [[...ring, first]] };
}
