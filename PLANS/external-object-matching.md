# External Object Matching (Factology Core)

Unifying the MusicBrainz matching pattern (from SetTempo) into a generic core capability so any Factology-family app can match user-created objects against free public databases.

## Two modes

### Mode A — UUID sources (MusicBrainz)
The external ID *is* the object's `thing_id`, owned by a dedicated catalog owner. Convergent across users by construction. Works because MusicBrainz MBIDs are UUIDs.

### Mode B — Non-UUID sources (OSM/Nominatim, Wikidata, GTIN, etc.)
The object keeps its own UUID. A `LINK_EXTERNAL_REF` link (new link type thing) carries the external record identity:
```
one_thing_id = the Factology object
link_type_id = LINK_EXTERNAL_REF
other_thing_id = Source thing (MusicBrainz / Nominatim provider)
data: { external_id, url, matched_at, confidence }
```

## "Common Public" flag

A new `Property` thing (`COMMON_PUBLIC = 'd1d1d1d1-0001-4000-8000-000000000001'`) — marks an object as "intended to be an authoritative public record; replace me when a canonical version exists."

- Sets with `PROPERTY_APPLIES_TO → Everything` with `data.inherited = true`
- Triggers the background matcher on create/update
- Is the server-side gate for "find existing canonical, or create one from provider"

## Provider registry

Every provider implements:
- `key` — short id (`'musicbrainz'`, `'nominatim'`)
- `name` — human label
- `classUuids[]` — which Factology classes this provider can match
- `search(query, ctx)` → `Candidate[]` where `Candidate = { providerKey, externalId, name, disambiguation?, payload? }`
- `candidateToThingData(candidate)` → thing fields (for Mode A: `{thing_id, name, owner}`, for Mode B: partial thing shape for caching)
- `externalUrl(externalId)` → URL to the live record
- `idScheme: 'uuid' | 'opaque'` — determines Mode A vs Mode B routing

Initial providers:
- `musicbrainz` — extracted from SetTempo `client.js` (Mode A)
- `nominatim` — wraps OSM/Nominatim search, preserves `osm_id` + `osm_type` (Mode B)

## Engine module structure (`packages/engine/src/external/`)

```
external/
├── registry.js       # Provider registry: register(), getProvider(thingClassId), list()
├── client.js         # Rate limiter + retry + circuit breaker (extracted from SetTempo)
├── matcher.js        # Generic background worker: single-flight queue, retry ladder, status stamps
├── promoter.js       # Mode A (replace thing_id, remap refs) + Mode B (create IMPORTED_FROM link)
├── search.js         # Search a provider by name + class, return candidates
├── providers/
│   ├── musicbrainz.js  # SetTempo client.js extracted, adapted to generic Candidate interface
│   └── nominatim.js    # OSM/Nominatim search with osm_id/osm_type → LINK_EXTERNAL_REF
```

## Server-side (`app/`)

### New service: `App/Services/ExternalLookup/LookupService.php`
- `findOrCreateCanonical(className, name, providerKey, externalId)` — the "Factology canonical object service" core
  - Check if canonical exists (by `LINK_EXTERNAL_REF` matching `external_id + provider`)
  - If not, search provider, create canonical Thing + LINK_EXTERNAL_REF
  - Return canonical thing (SYSTEM_OWNER-owned, public)
- `searchProvider(className, query)` → search the relevant provider, return candidates

### New endpoint: `GET /api/v1/external/lookup`
- Params: `class_id`, `name`, optional `provider_key`
- Returns: `{ candidates: Candidate[], source: 'local'|'provider' }`
- The UI shows candidates, user picks one → calls `POST /api/v1/external/adopt`

### New endpoint: `POST /api/v1/external/adopt`
- Params: `local_thing_id`, `provider_key`, `external_id`
- Server creates/canonical object if needed, creates LINK_EXTERNAL_REF, returns canonical thing
- Client remaps references from local_thing_id to canonical thing_id, deletes local

### Offline mirror (`resources/js/localTools.js` + `apiHandler.js`)
- `localExternalLookup()` — searches LocalIndexedDB for existing LINK_EXTERNAL_REF by provider+id, falls back to provider search
- `localExternalAdopt()` — creates LINK_EXTERNAL_REF locally, no server canonical

## Taxonomy additions

| Thing | UUID | Notes |
|---|---|---|
| `COMMON_PUBLIC` property | `d1d1d1d1-0001-4000-8000-000000000001` | Property class PROPERTY_CLASS |
| `LINK_EXTERNAL_REF` | `d1d1d1d1-0002-4000-8000-000000000001` | Link type thing (G_LINK) |
| MusicBrainz Source | seeded thing of class SOURCE_CLASS | System object |
| Nominatim Source | seeded thing of class SOURCE_CLASS | System object |

Constants: add to `packages/engine/src/constants/uuid.js` + `app/Models/Data/UUID.php`

## Matching flows

### Flow: User adds "Place" with common-public flag (Mode B — OSM)

1. User creates "Paris" as a Place, toggles `COMMON_PUBLIC` = true
2. Client saves: temp UUID, user-owned, `data.properties = { "COMMON_PUBLIC": true }`
3. Background matcher fires: `registry.getProvider(Place.classId)` → Nominatim
4. Provider.search("Paris", {city: true}) returns candidates with osm_id
5. Matcher creates LINK_EXTERNAL_REF: `{one_thing_id: temp, link_type: LINK_EXTERNAL_REF, other_thing_id: <Nominatim Source thing>, data: {external_id: 'R12345', url: 'https://osm.org/relation/12345', service: 'nominatim'}}`
6. On sync, server sees the LINK_EXTERNAL_REF, looks up `findOrCreateCanonical(Place, "Paris", "nominatim", "R12345")`
7. Server creates/finds canonical thing (SYSTEM_OWNER-owned, public) + LINK_EXTERNAL_REF
8. Server sends canonical to client → `promoter.replace(local, canonical)` — remaps references, deletes local
9. Any other user creating "Paris" with `COMMON_PUBLIC` gets the same canonical from the server

### Flow: User adds "Musician" with common-public flag (Mode A — MusicBrainz)

1. User creates "Jimmy Page" as a Musician, toggles `COMMON_PUBLIC` = true  
2. Background matcher: `registry.getProvider(Musician.classId)` → MusicBrainz
3. Provider.search("Jimmy Page", {type: "Person"}) → MBID
4. Promoter creates canonical thing: `thing_id = MBID`, `owner = MUSICBRAINZ_OWNER`, `public = true`
5. Reference remap: any objects pointing at the placeholder now point at the canonical
6. Placeholder soft-deleted
7. Same as current SetTempo behavior, just routed through the generic system

## Implementation order (Phase 1)

1. **Constants**: new UUIDs in engine + PHP, property seed
2. **Engine provider registry + client**: generic rate limiter/retry
3. **Engine musicbrainz provider**: adapt SetTempo's client.js to Candidate interface
4. **Engine nominatim provider**: new, preserves osm_id
5. **Engine matcher + promoter**: generic worker, reference remap
6. **Server LookupService + endpoints**: PHP side
7. **Offline mirror**: localTools.js, apiHandler.js
8. **SetTempo refactor**: consume engine external/ instead of its own
9. **Factology UI**: "Common public" toggle, matching status display

## Verification

- **Vitest**: provider search produces correct Candidate shapes; matcher promotes + remaps; retry ladder backs off
- **PHPUnit**: LookupService::findOrCreateCanonical creates on miss, returns on hit; LINK_EXTERNAL_REF round-trip
- **Integration**: flow through server → client adoption via sync
- **SetTempo**: existing matcher tests pass using engine external/