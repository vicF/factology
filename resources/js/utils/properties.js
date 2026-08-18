// resources/js/utils/properties.js
//
// Display formatting for an object's `data.properties` map (property thing_id
// => value) shown in the Details tab. Pure functions so they can be unit-tested
// independently of the view.

import { isGeoJsonGeometry, isLegacyLatLng } from './geo.js'
import { objectName, resolveLocalized } from './localized.js'

/** Render a number compactly (5 decimal places), or '' when not finite. */
export function formatCoord(n) {
    const num = Number(n);
    return Number.isFinite(num) ? String(Math.round(num * 1e5) / 1e5) : '';
}

/** Render a scalar as text, null/undefined → ''. */
export function formatScalar(v) {
    return v == null ? '' : String(v);
}

/**
 * Human-readable summary of a GeoJSON geometry. Points show lat/lng (+height);
 * other types show the type name and the number of top-level coordinate parts.
 * `t` maps i18n keys; defaults to identity.
 */
export function geoSummary(geometry, t = (key) => key) {
    const coords = geometry.coordinates;
    if (geometry.type === 'Point') {
        const text = `${t('Latitude')}: ${formatCoord(coords[0])}, ${t('Longitude')}: ${formatCoord(coords[1])}`;
        const height = coords[2];
        return height != null && height !== '' ? `${text}, ${t('Height (m)')}: ${formatScalar(height)}` : text;
    }
    return `${t(geometry.type)}: ${Array.isArray(coords) ? coords.length : 0}`;
}

/**
 * Format a single property value for display: GeoJSON geometry → coordinate
 * summary, legacy {lat,lng} → point, {value,unit} → "value unit", localized map
 * → resolved text, plain scalar → text. Returns `{ text, isGeo }`.
 */
export function formatPropertyValue(value, t = (key) => key) {
    if (value == null) return { text: '', isGeo: false };
    if (isGeoJsonGeometry(value)) return { text: geoSummary(value, t), isGeo: true };
    if (isLegacyLatLng(value)) {
        return {
            text: `${t('Latitude')}: ${formatCoord(value.lat)}, ${t('Longitude')}: ${formatCoord(value.lng)}`,
            isGeo: true,
        };
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
        if ('value' in value) {
            const text = formatScalar(resolveLocalized(value.value));
            const unit = formatScalar(value.unit);
            return { text: unit ? `${text} ${unit}` : text, isGeo: false };
        }
        return { text: formatScalar(resolveLocalized(value)), isGeo: false };
    }
    return { text: formatScalar(value), isGeo: false };
}

/**
 * Build the property rows for the Details tab: [{ property_id, name, text, isGeo }].
 * Skips empty values. `definitions` are property definitions from GET /api/v1/properties
 * (each { thing_id, name, name_translations }) used to resolve display names.
 */
export function buildPropertyEntries(properties, definitions = [], t = (key) => key) {
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return [];
    const entries = [];
    for (const [propertyId, value] of Object.entries(properties)) {
        if (value === '' || value === null || value === undefined) continue;
        const def = definitions.find((d) => d.thing_id === propertyId);
        const name = def ? objectName(def) || def.name || propertyId : propertyId;
        entries.push({ property_id: propertyId, name, ...formatPropertyValue(value, t) });
    }
    return entries;
}
