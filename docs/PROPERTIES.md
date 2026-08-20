# Properties

A property is a way to attach structured data to objects. The design lives in
code comments (`resources/js/utils/localized.js`) and the seeded system objects
(`database/seeders/LocalizationSeeder.php`); this document is the reference.

## Storage convention

Object property values are stored in the `things.data` jsonb column as a map:

```json
{
  "properties": {
    "<propertyThingId>": <value>
  }
}
```

The key is the `thing_id` of the property-definition object (a thing of class
**Property**). The value is one of:

| Format | Shape | Example |
|---|---|---|
| Plain scalar | number / string / boolean | `"70"` |
| Value + unit | `{ "value": ..., "unit": ... }` | `{ "value": 70, "unit": "kg" }` |
| Localized text | `{ "lang": "<code>", "<code>": "text", ... }` | `{ "lang": "en", "ru": "Санкт-Петербург" }` |
| **Coordinates** | GeoJSON geometry (see below) | `{ "type": "Point", "coordinates": [30.3351, 59.9343] }` |

### Coordinates (GeoJSON)

Coordinates are stored as a **GeoJSON geometry** and detected **by value
shape** — no hardcoded property id. Supported types: `Point`, `MultiPoint`,
`LineString`, `MultiLineString`, `Polygon`, `MultiPolygon`. Coordinate order is
GeoJSON's `[lng, lat]` with an optional 3rd element for **height/elevation**
(`[lng, lat, height]`). Examples:

```json
{ "type": "Point", "coordinates": [37.6173, 55.7558] }
{ "type": "LineString", "coordinates": [[37.6, 55.7], [37.7, 55.8]] }
{ "type": "Polygon", "coordinates": [[[37.6,55.7],[37.7,55.8],[37.8,55.6],[37.6,55.7]]] }
{ "type": "Point", "coordinates": [37.6173, 55.7558, 120] }   // with height
```

Legacy `{ "lat": ..., "lng": ... }` values are still recognized and treated as a
Point. The geometry may carry a `body` foreign member (default `earth`) for
objects on other celestial bodies — reserved for future per-body maps.

- PHP: `App\Services\GeoProperties::extract($properties)` returns
  `[{ geometry, property_id }]`.
- JS: `resources/js/utils/geo.js` — `extractCoordinates(propertiesMap)`,
  `isGeoJsonGeometry`, `isLegacyLatLng`, `isGeoPropertyName`, `buildMapFeatures`,
  `latLngToPoint`, plus vertex editing helpers `stripBlankCoords`, `appendVertex`,
  `closePolygon`.
- The backend adds a derived `geo` array (`[{ geometry, property_id }]`) to the
  object-detail payload (`app/Models/Classes/Everything.php`) and to each
  related-object `target` (`app/Services/RelatedObjectsResolver.php::buildTarget`),
  so the Map tab and the edit form never parse raw JSON themselves.
- The Map tab (`resources/js/components/ObjectMap.vue`) renders any geometry via
  `L.geoJSON` (points as markers, lines/polygons as vectors); the edit form
  (`resources/js/components/EditObject.vue` + `GeoPicker.vue`) edits them.

## Creating a property and linking it to a class

1. Create an object of class **Property** (`b1b1b1b1-0001-4000-8000-000000000001`),
   e.g. name it "Coordinates".
2. Link it to a target class with link type **is a property of class**
   (`b1b1b1b1-0003-4000-8000-000000000001`, `PROPERTY_APPLIES_TO`): property
   thing → class thing.

The edit form then offers the property when editing objects of that class (via
`GET /api/v1/class/{id}/properties`). The coordinate-named one gets the
Coordinates editor (point + geometry + height); other properties get a plain
text value. When nothing is pre-linked, the edit form's **Add property** picker
(`GET /api/v1/properties`) can attach any existing property or create a new one.

### Inheritance

A property definition may carry an **`inherited`** flag (`data.inherited`,
boolean, **default true**) controlling whether it propagates to **subclasses**
of the linked class. `classProperties` walks up the class hierarchy
(LINK_TO_PARENT links) and includes a property if it is linked to the class
directly, or to any ancestor while `inherited` is true. Editing a
Property-class object shows an **Inherited** checkbox for this flag. Setting
inherited on "Coordinates" and linking it to a class makes it available on that
class's subclasses. The seeded `GeoCoordinatesSeeder` links inherited
"Coordinates" to the system **Place** class, so every place-like class (cities,
buildings, mountains, craters — on Earth or any other body) gets the field
suggested, while any object can still carry coordinates via "Add property".

Example (mirrors `LocalizationSeeder`):

```php
DB::table('links')->insert([
    'one_thing_id'   => $geoPropertyThingId,   // property definition
    'other_thing_id' => $placeClassThingId,    // class it applies to
    'link_type_id'   => UUID::PROPERTY_APPLIES_TO,
    'public'         => true,
    'link_uuid'      => (string) Str::uuid(),
]);
```

## System objects

Seeded once by `LocalizationSeeder` (idempotent upserts):

| Constant (PHP `app/Models/Data/UUID.php`) | UUID | Purpose |
|---|---|---|
| `PROPERTY_CLASS` | `b1b1b1b1-0001-4000-8000-000000000001` | class of property-definition objects |
| `LANGUAGE_CLASS` | `b1b1b1b1-0002-4000-8000-000000000001` | class of language objects |
| `PROPERTY_APPLIES_TO` | `b1b1b1b1-0003-4000-8000-000000000001` | link type "is a property of class" |
| `LANG_EN` / `LANG_RU` | `b1b1b1b1-0011/0012-...` | seeded languages |

`GeoCoordinatesSeeder` (runs from `DatabaseSeeder`) seeds the **Coordinates**
property (class Property, `data.inherited = true`) and the `PROPERTY_APPLIES_TO`
link `Coordinates → Place` (`PLACE_CLASS`, the system class that groups City,
Country, Planet, Building, house, ...). `COORDINATES_PROPERTY` and `PLACE_CLASS`
are constants in `app/Models/Data/UUID.php`.

Keep the constants in sync between `app/Models/Data/UUID.php` and
`resources/js/constants/uuid.js`.
