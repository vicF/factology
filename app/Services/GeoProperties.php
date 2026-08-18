<?php

namespace App\Services;

/**
 * Detection/extraction of "Earth Coordinates" stored as object properties.
 *
 * Coordinates live in an object's jsonb `data.properties` map as a GeoJSON
 * geometry: `{ <propertyThingId>: { type, coordinates } }` where `coordinates`
 * use GeoJSON order `[lng, lat]` with an optional 3rd element for height
 * (e.g. `{ "type": "Point", "coordinates": [37.6173, 55.7558] }`).
 *
 * Detection is purely by value shape (no hardcoded property id). Legacy
 * `{ lat, lng }` values are still recognized and normalized to a Point.
 * Mirrors resources/js/utils/geo.js.
 */
class GeoProperties
{
    public const GEO_TYPES = [
        'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon',
    ];
    public const LAT_RANGE = [-90.0, 90.0];
    public const LNG_RANGE = [-180.0, 180.0];

    /**
     * Given a decoded `data.properties` map (property thing_id => value),
     * return the coordinate entries as GeoJSON geometries.
     *
     * @return array<int, array{geometry: array, property_id: string}>
     */
    public static function extract(?array $properties): array
    {
        if (!$properties) {
            return [];
        }

        $out = [];
        foreach ($properties as $propId => $value) {
            if (!is_array($value)) {
                continue;
            }
            $geometry = self::geometryOf($value);
            if ($geometry === null) {
                continue;
            }
            $out[] = [
                'geometry'    => $geometry,
                'property_id' => (string) $propId,
            ];
        }

        return $out;
    }

    /** Normalize a property value into a GeoJSON geometry, or null when it is not one. */
    private static function geometryOf(array $value): ?array
    {
        if (isset($value['type']) && in_array($value['type'], self::GEO_TYPES, true)
            && isset($value['coordinates']) && is_array($value['coordinates'])
            && self::coordsValid($value['coordinates'])) {
            return $value;
        }

        // Legacy { lat, lng } → Point ([lng, lat] GeoJSON order).
        if (array_key_exists('lat', $value) && array_key_exists('lng', $value)) {
            $lat = self::coerce($value['lat']);
            $lng = self::coerce($value['lng']);
            if ($lat !== null && $lng !== null
                && $lat >= self::LAT_RANGE[0] && $lat <= self::LAT_RANGE[1]
                && $lng >= self::LNG_RANGE[0] && $lng <= self::LNG_RANGE[1]) {
                return ['type' => 'Point', 'coordinates' => [$lng, $lat]];
            }
        }

        return null;
    }

    /**
     * Recursively validate a GeoJSON `coordinates` array: every leaf is a
     * `[lng, lat, ?height]` tuple with lng∈[-180,180], lat∈[-90,90].
     */
    private static function coordsValid($coords): bool
    {
        if (!is_array($coords) || empty($coords)) {
            return false;
        }

        $first = $coords[0] ?? null;
        if (is_numeric($first)) {
            // Leaf coordinate tuple.
            $lng = self::coerce($coords[0] ?? null);
            $lat = self::coerce($coords[1] ?? null);
            if ($lng === null || $lat === null) {
                return false;
            }
            if ($lng < self::LNG_RANGE[0] || $lng > self::LNG_RANGE[1]
                || $lat < self::LAT_RANGE[0] || $lat > self::LAT_RANGE[1]) {
                return false;
            }
            return true;
        }

        // Nested coordinate arrays (rings / position lists).
        foreach ($coords as $nested) {
            if (!self::coordsValid($nested)) {
                return false;
            }
        }
        return true;
    }

    /** Float if numeric (number or numeric string), otherwise null. */
    private static function coerce($value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }
}
