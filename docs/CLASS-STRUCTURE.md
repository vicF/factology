# Factology — class naming & structure review

> Review date: 2026-09-03 · Advisory only — **no code changes applied** from this document.

A review of the codebase's class naming and folder structure "from a human point of view" — how easy it is to understand what classes are and where to find them — plus low-risk recommendations. Re-verify each item against the current tree before acting, since the codebase moves fast.

Scope:
- Backend PHP: `app/**` (Models, Eloquent, Http/Controllers, Services, Console)
- Frontend JS/Vue: `resources/js/**`
- Cross-cutting terminology backend-vs-frontend

Two structural facts frame everything:
1. The data model is deliberately thin and homogeneous — almost every domain concept is a row in `things` or `links`, distinguished only by `type` int and link relations. This means the **naming** of the model classes and folders carries most of the domain-meaning load.
2. Backend evolved in two generations (legacy `App\Eloquent` Eloquent models vs the newer `App\Models\Classes` actor layer) and the frontend in two (server-only → offline Dexie sync), so both have parallel, differently-named layers for the same concept.

---

## 1. Already clear — keep as-is

These are well named/structured and should be the *pattern* going forward:
- Feature-pod services: `Services/Importer/{GedcomImporter, GedcomParser, DuplicatePersonMatcher}`, `Services/MediaLink/{MediaTitleResolver, UrlMediaClassifier}` — folder = feature, class = role.
- `Services/RelatedObjectsResolver`, `GeoProperties`, `DatabaseConsistencyChecker` — verb/noun names that state responsibility.
- `Http/Controllers/Auth/*`, `Http/Resources/{ThingResource, LinkResource}`, `Http/Requests/{SearchRequest, ImportRequest}`, `Eloquent/Scopes/AuthScope`.
- Frontend `components/icons/`, `components/Fields/`, `components/layouts/`, `*Modal.vue` suffix, store names (`auth`, `search`, `objects`, `ui`), composables (`useClickOutside`, `useTreeState`).

---

## 2. Backend — observations & recommendations

### Naming problems (most → least confusing)

| # | Current | Human-perspective problem | Recommendation |
|---|---------|---------------------------|----------------|
| B1 | `Models/Classes/Everything` — base class of the whole object model | A class named "Everything" (with a stale docblock `@package Fokin\facts\Classes` / "Class Anything") tells the reader nothing; it reads as a placeholder. As the root of the object model it deserves a real name. | `AbstractThing`, `ThingBase`, or `DomainObject`. |
| B2 | Directory `Models/Classes/` contains the rich actor layer (`Everything`, `Thing`, `Media`, `MediaFile`, `UserClass`) | "Classes" collides with the **domain concept "class"** (a thing that acts as a taxonomy class). A reader hunting the Class-Tree code sees `Models/Classes/` and guesses wrong. | Rename folder to `Models/Domain/` (or `Models/Entities/` / `Models/Things/`). |
| B3 | `Models/Classes/UserClass` | Reads as "a class of the User". Likely means "user-defined class" or "class-thing instance". Ambiguous. | `ClassThing`, `ObjectClass`, or `UserDefinedClass`. |
| B4 | Two model families: legacy `App\Eloquent\Thing`/`Link` (marked `@deprecated`) vs active `App\Models\Classes\Thing` — **same class name `Thing` in two namespaces**, same tables | Even with deprecation tags, `Thing` existing twice makes every `use` statement a puzzle: *which Thing?* The folder names `Eloquent` vs `Classes` don't communicate the real distinction (thin ORM wrapper vs rich domain object) and both get imported inside the same files (e.g. `Everything.php` imports both `App\Eloquent\Thing` and `App\Eloquent\Link`). | The collision itself is the issue: once the active layer moves to a clear home (B2), delete the deprecated family; if it must stay, rename it so no two live classes share `Thing`. |
| B5 | Namespace fragmentation in `app/Models`: `App\Models` + `App\Models\Classes` + `Fokin\Facts\Data` (composer maps `Fokin\Facts\` → `app/Models`); a sibling `Fokin\PhotoFacts\` maps to a **separate external tree** `Projects/PhotoFacts` | Reading `Fokin\Facts\Data\UUID` gives zero signal that this is the app's own canonical ID/constant holder; a private-name namespace hides that. Physical location (`app/Models/Data`) and logical namespace (`Fokin\Facts\Data`) diverge from the `App\` root used everywhere else. | Align the namespace to the project: `App\Domain\Data\UUID` (or `App\Support\`), single root for all app code. Decide explicitly whether `Projects/PhotoFacts` stays a separate package (then it should be a real composer package with its own `composer.json`) or gets merged into `app/`. |
| B6 | `app/Models/Data/UUID.php` — a class named `UUID` that mostly holds **system-constant IDs** (`GENERAL`, `G_CLASS`, `G_LINK`, property/link-type UUIDs) | Name implies "a UUID" (like ramsey/uuid), but it's the registry of canonical object ids + a few constants. `@deprecaed use UUID constants` notes on `Everything` even self-reference it. | `SystemIds` / `CanonicalIds` / `ObjectTypes`. Matches its frontend twin `constants/uuid.js` (see F7). |
| B7 | `ApiController` — single ~1,880-line controller handling objects, links, classes, media, photos, search, suggest, visibility, export, history | Name is fine, but as the **only** API controller it pushes every verb into one file; the frontend must know "everything is under `/api/…` on one controller". | Split the *surface* by resource: `ObjectsController`, `LinksController`, `ClassesController`, `MediaController`, `SearchController`, `AuthApiController`, … — each name then matches a route group in `routes/api.php`. |
| B8 | Root-level controllers that aren't API resources mixed with domain ones: `TestDatabaseController`, `ToolsController`, `PagesMusicController`, `HomeController`, `TokenController`, `LegalController` | `PagesMusicController` is opaque (pages-and-music in one class?); `HomeController`/`PagesMusicController` are web-page leftovers sitting next to the API surface. No `Admin/` or `Support/` grouping. | Sub-group by surface: `Web/` (Home, PagesMusic, Legal) vs `Api/` (rest), or an `Admin/` group for Test/Tools. Rename `PagesMusicController` to its real purpose (e.g. `StaticPagesController`). |
| B9 | Console commands with throwaway `tmp*` prefixes: `tmpDeleteOrphanPhotoRecords`, `tmpFixPhotos`, `tmpGeneratePhotoHashes`, `tmpRestructureThumbs` | `tmp` means "temporary hack" — signals dead weight and invites further `tmp*` clutter. | Either delete (they look one-off) or promote to proper verbs: `Photos:PruneOrphans`, `Photos:GenerateHashes`. |
| B10 | `Models/Classes/MediaFile` / `Eloquent/PhotoFile` / `Eloquent/PhotoMedia` | Naming splits photos across `Media*` (new) and `Photo*` (legacy) families; frontend/domain say "photo", the table says `photos`. | Unify the term (see C1) — pick **one** of photo/media per concept. |
| B11 | Stale IDE-template residue: `Everything.php` header `facts1 / User: fokin / Created: 07/10/2019`, docblock `@package Fokin\facts\Classes` | Human-first signal: these artifacts make files look unmaintained. | Drop header templates; keep only meaningful docblocks. |

### Structure recommendation — proposed backend layout (target, low-risk renames only)

```
app/
  Models/                      App\Models       (User, LegalDocument, LegalConsent)
    Domain/                    Everything→ThingBase, Thing, Media, MediaFile, UserClass→ClassThing
    Data/                      Era, FieldLanguage, FlexibleDate, UUID→SystemIds
  Services/                    (unchanged pods)
  Http/Controllers/
    Api/                       Objects, Links, Classes, Media, Search, Auth…
    Auth/                      (existing)
    Web/                       Home, PagesMusic, Legal
    Admin/                     Tools, TestDatabase
```

---

## 3. Frontend — observations & recommendations

### Naming problems

| # | Current | Human-perspective problem | Recommendation |
|---|---------|---------------------------|----------------|
| F1 | God views named by bare noun: `Object.vue` (1,392 lines), `EditObject.vue` (2,049), `Search.vue`, `Graph.vue`, `Tools.vue` | Bare noun hides role. `Object.vue` is "object detail page", `EditObject.vue` is "create/edit modal for any object type" — only discoverable by opening them. Also `EditObject` is not "edit of Object" exclusively; it creates too. | Role-suffixed names: `ObjectPage.vue`, `ObjectEditModal.vue` (or split `Create/Edit`), `SearchPage.vue`, `GraphPage.vue`. Matches the existing good `*Modal.vue` convention. |
| F2 | Directory naming style is inconsistent: `localDb`, `objectCache`, `dataLayer` (camelCase) vs `utils`, `constants`, `identity`, `lang` (lowercase) | No single rule → each new subfolder is a guess. `lang/`, `localization/`, and util `localized.js` are three homes for i18n-ish concerns. | One rule: e.g. lowercase (or kebab-case) everywhere — `local-db`/`localDb`, `data-layer`. Consolidate language code into one place: `lang/` (or `i18n/`). |
| F3 | Both `resources/js/constants.js` **and** `resources/js/constants/` exist | Same concept, two homes (the folder even split off from the file per history). New dev can't tell which is canonical. | Finish the migration: fold `constants.js` into `constants/`, or fold the folder back into the file. |
| F4 | Duplicated persistence layers, differently named: `localDb/` (Dexie, canonical offline store), `dataLayer/` (older local+server read layer), `localDb/apiHandler.js` (Dexie mirror of axios routes), plus raw `axios` in 17 components | Three code paths to read/write the same objects with three vocabularies (`localDb.*`, `dataLayer.*`, `apiHandler.*`). Hard to answer "where does an object write go?". | Single vocabulary + single entry point (`dataLayer` or a new `api/` + `db/`), components stop calling `axios` directly. |
| F5 | No domain layer, field-name drift: same id referenced as `obj.id`, `obj.thing_id`, `node.id`; normalization happens ad-hoc in `dataLayer/search` (lines ~133/146) | Backend calls the entity **Thing**; frontend calls it **object** (C1); within frontend the same key is spelled two ways. | Central normalization (single `id` alias) + a thin entity module (even untyped JS factories) so naming lives in one file. |
| F6 | `stores/` mixes options-API stores (`objects.js`, `objectCache.js`) and setup-API stores (`search`, `auth`, `ui`, …) | The split is invisible from file names; a reader sees two paradigms side-by-side. | Standardize on one store style; not a naming fix but makes names trustworthy. |
| F7 | `constants/uuid.js` frontend mirrors `Models/Data/UUID.php` backend | Two registries for system ids is fine (platform mirror), but the class/file name says nothing about what it holds (see B6). | Mirror the backend rename: `constants/systemIds.js` ↔ `SystemIds`. |

### Structure recommendation — proposed frontend layout (target)

```
resources/js/
  api/           (single axios client — replaces scattered calls + apiHandler)
  db/            (Dexie schema — rename from localDb)
  stores/        (one style)
  i18n/          (merge lang/ + localization/ + localized.js)
  constants/     (single home; absorb constants.js)
  utils/         (drop localized.js after i18n merge; split flexibleDate↔dateUtils overlap later)
  domain/        (Thing/Link field normalization, type maps)
  components/    ObjectPage.vue, ObjectEditModal.vue, … + Fields/, icons/, layouts/
  sync/          (unchanged)
```

---

## 4. Cross-cutting: pick one word per concept

The biggest readability win is a shared vocabulary table, applied consistently both sides:

| Concept | Backend says | Frontend says | Recommend |
|---|---|---|---|
| The primary entity | **Thing** / **Everything** | **object** | one term — *Thing* matches the schema (`things` table, `thing_id`); or *object* if the product language wins. Decide and rename the other side's names/labels. |
| Entity base | `Everything` | — | `ThingBase`/`AbstractThing` |
| Taxonomy node | `UserClass` | class | `ClassThing` / `ObjectClass` |
| Photos | `PhotoFile`/`PhotoMedia` (legacy) vs `Media`/`MediaFile` (new) | `Image.vue`, photos | keep *media* as the general concept, *photo* for concrete? — or unify to one. |
| System id registry | `Models/Data/UUID` | `constants/uuid.js` | `SystemIds` |
| "Create/edit object" | `store` on `ApiController` | `EditObject.vue` | `create`/`update` verbs |

---

## 5. Suggested execution order (only if/when desired)

None of this is applied yet. If pursued later, lowest-risk order:
1. Pure **renames that are internal to one layer** (B9 tmp commands, B6/B7-style class renames where call-sites are few, F3 constants consolidation).
2. **Folder moves with namespace updates** (B2 `Models/Classes/` → `Models/Domain/`, F2 casing) — mechanical, git-history friendly if done as `git mv`.
3. **Cross-layer vocabulary unification** (C1 Thing/object) — last, since it touches DB-facing names, labels, and tests.

Each step keeps behavior identical; re-run `bash run-tests.sh --no-mobile` after any batch.

---

## Out of scope (noted, not pursued here)

- Behavior refactors: splitting fat code out of `ApiController` / `Everything` / `EditObject.vue`/`Object.vue`; dead FormRequests; absent Policies/Jobs/Enums; duplicated visibility scopes. These are *code* structure, not *naming* structure.
- Renaming the `things`/`links` tables or API routes (breaking, cross-system).
