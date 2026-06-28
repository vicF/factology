# Factology Multi-Platform Development Plan

> Design decisions finalized in `PLANS/classes-sync-rules-plan.md`.
> This document focuses on the technical implementation roadmap.

## Overview
Upgrade the Factology application to support:
- **Local mobile**: Android, iOS (via Capacitor — already configured)
- **Desktop**: Windows, Linux (via Electron — already configured)
- **Web SPA**: Using the same API as standalone apps
- **Offline-first**: Full offline capability with local storage
- **UUID-based sync**: Diff tracking between local storage and multiple server APIs
- **Permissions**: Private, group, public visibility levels
- **Difference tracking**: Divergent info allowed, users choose to adopt/ignore/suggest

---

## Phase 1: Local Storage Layer (Offline-First Foundation)

### 1.1 Install and Configure Local Database
- Install **Dexie.js** (IndexedDB wrapper with native JSON object support — matches Postgres JSON capabilities)
- Create `resources/js/localDb/index.js` — the unified local database module
- Create schema:
  - `objects` store — mirrors `things` table (thing_id, name, type, description, start, end, public, owner, deleted, data [JSON], _syncStatus, _serverRevision, _localRevision)
  - `links` store — mirrors `links` table (link_id, one_thing_id, link_type_id, other_thing_id, translation, public, link_start, link_end, _syncStatus, _serverRevision, _localRevision)
  - `media` store — metadata for media files (thing_id, filename, size, crc, _syncStatus)
  - `pendingChanges` store — queue of changes to sync when online (id, operation, table, recordId, payload, serverId, timestamp)
  - `syncMetadata` store — track last sync time per server endpoint (serverId, lastPullTimestamp, lastPushTimestamp)
  - JSON fields (`data` on objects) are stored as plain objects — IndexedDB handles them natively, no serialization needed

### 1.2 Implement CRUD for Local DB
- `resources/js/localDb/objects.js` — getById, save, delete, list, search
- `resources/js/localDb/links.js` — getById, save, delete, listByThingId
- `resources/js/localDb/media.js` — getById, save, delete
- Each write sets `_syncStatus` to 'local', `_localRevision` incremented, and enqueues to `pendingChanges`

### 1.3 Create Sync Status Constants
- `resources/js/constants/syncStatus.js`:
  - `SYNCED` — record matches server
  - `LOCAL` — local changes pending sync
  - `CONFLICT` — both local and server changed
  - `SERVER_ONLY` — only exists on server (pulled, not yet modified locally)
  - `LOCAL_ONLY` — only exists locally (never pushed)

### 1.4 Online/Offline Detection
- Extend `resources/js/utils/platform.js` with `NetworkMonitor`:
  - Listen to `online`/`offline` events
  - Expose reactive `isOnline` ref
  - Emit events via eventBus for connected/disconnected
- Add periodic health-check ping to API server

---

## Phase 2: Sync Engine

### 2.1 Server API — Sync Endpoints
Add to `routes/api.php` (auth-protected):

```
POST /api/v1/sync/pull
  Request: { lastSyncTimestamp, tableFilter: ['things'|'links'|'media'] }
  Response: { changes: { objects: [...], links: [...], media: [...] }, serverTimestamp }

POST /api/v1/sync/push
  Request: { changes: { objects: [...], links: [...], media: [...] } }
  Response: { accepted: [...], conflicts: [...], serverTimestamp }

POST /api/v1/sync/resolve
  Request: { thingId, resolution: { strategy: 'local'|'server'|'merge', mergedData?: {...} } }
  Response: { success, data }
```

### 2.2 Server-Side Sync Logic
- Create `app/Services/SyncService.php`:
  - `pull()` — query records updated since timestamp, return changes
  - `push()` — accept client changes, flag differences (not conflicts)
  - See `PLANS/classes-sync-rules-plan.md` §11 for the difference tracking model
- Add `record_updated` and `sync_version` columns to `things`/`links` tables (if not present — `things.record_updated` already exists)
- Create `app/Http/Controllers/SyncController.php`

### 2.3 Client-Side Sync Engine
- `resources/js/sync/SyncEngine.js`:
  - `sync()` — pull→diff→push pipeline
  - `pullFromServer()` — fetch server changes since last sync
  - `pushToServer()` — send pending local changes
  - `compareWithLocal()` — compare pulled objects with local copies
  - `trackDifferences()` — store field-level diffs between `same_as`-linked objects
- `resources/js/sync/DiffTracker.js`:
  - `compareObjects(local, remote)` — returns list of differing fields
  - `adoptChange(objectUuid, field, value)` — user decided to adopt remote value
  - `ignoreDiff(objectUuid, field)` — dismiss this hint
  - No auto-resolution. All merges are user-initiated.

### 2.4 Background Sync
- Register periodic sync when online (every 30s default, configurable)
- Use `navigator.serviceWorker` for background sync on web
- Use Capacitor Background Task plugin for mobile

---

## Phase 3: Permissions & Policies

### 3.1 Permission Model — Link-Based (implemented)

Permissions use the universal entity model (everything is a thing + links):

| Concept | Implementation | Status |
|---------|---------------|--------|
| **Group** | A `things` record | Existing, used in data |
| **User → Group membership** | `BELONGS_TO_USER_GROUP` link (`e18d73eb-...`) | Existing, used in data |
| **Group → Thing read access** | `GROUP_READ_ACCESS` link (`ea206516-...`) | Existing, used in data |
| **Auth query macro** | `DB::table('things')->auth()` — resolves access via link joins | **Rewritten** — no longer uses `things_access` table |
| **Eloquent AuthScope** | Global scope on `Thing` model — same link-based logic | **Updated** — now handles group access for authenticated users |

The `things_access` and `links_access` tables have been **removed**. The `auth()` macro now resolves access with a subquery:

```
things ──GROUP_READ_ACCESS──► groups ◄──BELONGS_TO_USER_GROUP── user
```

To grant a group access to a thing, create a link:
- `one_thing_id` = the thing
- `link_type_id` = `GROUP_READ_ACCESS`
- `other_thing_id` = the group

To add a user to a group, create a link:
- `one_thing_id` = the user's `thing_id`
- `link_type_id` = `BELONGS_TO_USER_GROUP`
- `other_thing_id` = the group

**Policy files** (not yet created) — `ThingPolicy`/`LinkPolicy` can use the same link-based resolution.

### 3.2 Add Visibility Column to Things
New migration needed:
```php
// Add visibility to things
$table->enum('visibility', ['private', 'public', 'group'])->default('private');
```

This field is **independent** of the link-based permission system. It controls:
- `private` — only owner and group-read-access members see it
- `public` — visible to everyone (equivalent to `things.public = 1`)
- `group` — only visible to group members (via `GROUP_READ_ACCESS` links)

### 3.3 Visibility Rules
| Visibility | Read | Default Write | Editable By Others | Sync |
|---|---|---|---|---|
| `private` | Owner + group members | Owner only | No | Local only (never pushed) |
| `group` (group-visible) | Group members + owner | Owner only | If owner grants `GROUP_WRITE_ACCESS` link | Push/pull to server, server serves to group by link |
| `public` | Anyone | Owner only | If owner grants edit permission | Push/pull to all servers |

**Write access** — not yet implemented. Future: a `GROUP_WRITE_ACCESS` link type (same pattern as read).

**Other-user edits** (TBD — two approaches to implement):
- **Approach A (Manual merge)**: Other user's edit creates a pending change. Owner reviews and accepts/rejects.
- **Approach B (Copy-on-edit)**: Other user's edit creates a new thing linked to the original. Owner can merge later by accepting the new thing's data.

Both approaches use field-level diffing — only changed fields are tracked.

### 3.4 Group Management (not yet implemented)
- No dedicated GroupController yet — groups are created as things via the existing API
- Future: `app/Http/Controllers/GroupController.php`:
  - Create/delete groups, add/remove members via link management
  - Set group permissions by creating/removing `GROUP_READ_ACCESS` links
- Future: `resources/js/components/GroupManager.vue` — UI for managing groups

### 3.5 Apply Policies to API Controllers (not yet implemented)
- Update `ApiController` to check link-based policies:
  - `list()` / `get()` — already filtered by `auth()` macro
  - `store()` / `update()` — check ownership + `GROUP_WRITE_ACCESS`
  - `delete()` — owner-only
- Create `app/Policies/ThingPolicy.php` and `app/Policies/LinkPolicy.php`
- Register in `AuthServiceProvider`

### 3.6 Server Registry
- Servers are `things` records with `type = G_SERVER (6)`:
  - `thing_id` — UUID (unique server identifier)
  - `name` — human-readable server name (e.g. "Main Server", "Family Tree")
  - `description` — server URL (e.g. "https://api.example.com/api/v1")
  - `owner` — who registered this server
- `resources/js/stores/serverRegistry.js` — manage list of known servers
- Allow user to add/remove servers via UI
- Each known server gets a `stored_on` link for objects it holds (see §4.1)

---

## Phase 4: Multi-Source Data Layer

### 4.1 Unified Data Layer (implemented)

The data layer (`resources/js/dataLayer/index.js`) is the single entry point for all reads and writes. It hides whether data comes from local IndexedDB, Server A, Server B, or multiple sources.

#### Core Model: `stored_on` Link

An object's presence on a server is tracked by a **`stored_on` link** (reuses `LINK_TO_STORAGE` UUID = `1dcb897e-...`):

```
object ──stored_on──► server-thing-A
object ──stored_on──► server-thing-B
```

- **No `stored_on` link** → local-only object (never leaves the device)
- **One `stored_on` link** → lives on that specific server
- **Multiple `stored_on` links** → lives on multiple servers
- Links are created when the user chooses to sync an object to a server, or when pulling from a server

#### API

| Function | Behaviour |
|----------|-----------|
| `search(query, { sources, types })` | Queries local DB + all reachable servers in parallel, merges by UUID. Returns objects tagged with `_source: ['local', 'ServerA']` |
| `getObject(uuid, { localOnly })` | Local DB first (instant) → falls back to servers if not found → caches server results locally |
| `saveObject(data, { syncToServers })` | Always writes to local DB (offline-safe). Creates/updates `stored_on` links for target servers. Enqueues pending changes per server |
| `deleteObject(uuid, { syncToServers })` | Soft-deletes locally, enqueues delete per server |
| `getObjectServers(uuid)` | Returns server UUIDs this object has `stored_on` links to |
| `getServers()` | Returns all known servers (cached from local DB) |

#### Merge Strategy

```
Search "photo" →
  Local:  [{id: A, name: "photo 1"}, {id: B, name: "photo 2"}]
  Server: [{id: B, name: "photo 2 v2"}, {id: C, name: "photo 3"}]
  Merge:  [{id: A, name: "photo 1",          _source: ['local']},
           {id: B, name: "photo 2 v2",       _source: ['local', 'MyServer']},
           {id: C, name: "photo 3",          _source: ['MyServer']}]
```

- **Local always wins** for display (fast, available offline)
- Server data fills gaps (missing fields, new records not yet cached)
- Duplicates resolved by UUID — no duplicate records
- `_source` array tells the UI where each result came from

#### Write Flow

```
saveObject(data, { syncToServers: ['server-a', 'server-b'] })
  1. Write to IndexedDB immediately — UI updates instantly
  2. Upsert `stored_on` links for each target server
  3. Enqueue pending change per server (server-a: UPDATE, server-b: INSERT)
  4. Sync engine picks up pending changes when online
```

### 4.2 Server-Specific Sync Status

Objects track sync state **per server** through the combination of:
- `_syncStatus` on the object itself (dirtiest state across all servers)
- `stored_on` links (which servers have this object)
- `pendingChanges` queue entries (per server, per object operation)

| State | Meaning |
|-------|---------|
| Object has no `stored_on` links, `_syncStatus = local_only` | Local-only, never pushed |
| Object has `stored_on` → Server A, `_syncStatus = synced` | Fully synced to Server A |
| Object has `stored_on` → Server A + Server B, `_syncStatus = local` | Modified locally, pending push to both servers |
| Object has `stored_on` → Server A, found via search from Server B | Exists on Server A, visible in cross-server search |

### 4.3 Offline-First UI
- Add offline indicator component: `resources/js/components/OfflineIndicator.vue`
- Show sync status on objects: "Saved locally", "Synced", "Conflict"
- `resources/js/components/SyncStatus.vue` — show pending changes count, last sync time
- Add "Force Sync" button to trigger immediate sync

### 4.3 Capacitor-Specific
- Configure `@capacitor/preferences` (already installed) for local settings
- Add `capacitor-network` plugin for network detection on native
- Add file system plugin for media storage on mobile
- Build configuration for Android/iOS already in place

### 4.4 Electron-Specific
- Configure electron-builder (already configured)
- Add local file system access for media storage
- Add auto-update capability
- Configure IPC for native file operations

### 4.5 Web SPA
- Works as-is via browser, online-only (no IndexedDB if user wants to skip offline)
- Optional offline via service worker + IndexedDB

---

## Phase 5: Media Sync

### 5.1 Media File Handling
- Media files (photos) are large — sync metadata first, then files on demand
- `resources/js/sync/MediaSync.js`:
  - Sync photo_media + photo_files records as metadata
  - Actual file transfer via existing upload endpoint
  - Thumbnail sync (small files, sync eagerly)
  - Full-resolution sync (on demand or WiFi-only)

### 5.2 Background Upload
- Queue file uploads when online
- Resume interrupted uploads
- WiFi-only mode option

---

## Phase 6: Testing Infrastructure

### See `test-plan.md` for the complete testing strategy

---

## Implementation Order (Recommended)

> Full design rationale in `PLANS/classes-sync-rules-plan.md`.
> Current phase: **Phase 0** — admin setup + base classes (implemented).

0. **Phase 0** — Admin + Base Classes (✅ done)
   - `is_admin` migration, `InstallAdmin` command, `ResetAdminPassword` command
   - Base class tree seeded (Events, People, Places, Media, Organizations)
   - Provenance link types seeded (created_by, created_on, same_as, derived_from, ...)
   - Docker entrypoint integrates seeding + admin creation
   - `bin/install` script with interactive admin setup

1. **Phase 1** (User/Person split) — get identity model right first
   - `person_id` on users table
   - `UserClass` creates User (per-server) + Person (server-scoped UUID)
   - Ownership checks use `person_id`
   - Owner default no longer hardcoded to UUID::VICTOR_FOKIN

2. **Phase 1b** (created_by / created_on links)
   - Set `created_by` (→ User) and `created_on` (→ Server) links when creating objects
   - Server/app UUID generation during first setup

3. **Phase 2** (Local Storage) + **Phase 2b** (Sync Engine)
   - Dexie.js IndexedDB schema matching the `things`/`links` tables
   - DiffTracker with field-level comparison
   - Sync engine that pulls, diffs, and flags changes
   - `same_as` link support in UI

4. **Phase 3** (Permissions) — add access control
   - Visibility enum (private/group/public) replacing `public` boolean
   - Group management UI
   - Policy files

5. **Phase 4** (Multi-Platform) — polish platform-specific features
6. **Phase 5** (Media Sync) — handle photos/files
7. **Phase 6** (Testing) — continuously alongside each phase

---

## Key Design Decisions

> Complete design decisions in `PLANS/classes-sync-rules-plan.md` §15.
> Below are the technical implications relevant to implementation.

1. **UUID everywhere**: The system already uses UUIDs for all records (things, links, media). This is correct for distributed sync — no ID conflicts across servers/clients.

2. **Everything is a "thing"**: Users, groups, servers, link types, class types — all are things in the `things` table. This unified entity model means permissions, sync, and relationships all work the same way for every object in the system.

3. **Field-level diffing** (not conflict resolution): Edits track which fields changed. When syncing, differing fields are flagged for user review rather than auto-merged. Users can adopt, ignore, or suggest corrections.

4. **Other-user edits**: Users can suggest changes via the suggestion protocol (`suggests_change` link). Owner reviews and accepts/declines. No automatic forking.

5. **Local-first, not remote-first**: The local database is the source of truth. Server API is a sync target. This enables full offline use.

6. **Visibility = sync behavior**: The `visibility` field controls what syncs where. Private records never leave the device. Server records go to a specific server. Public records sync everywhere.

7. **Servers hold subsets**: Each record belongs to a specific server (or is local-only). Different servers can hold different subsets of data.

8. **`stored_on` link = multi-server tracking**: Instead of a `_serverId` field (limited to one server), objects use `stored_on` links to track which servers hold them. Adding a new server requires no schema changes, just a new link.

9. **Search merges, doesn't union**: When searching across sources, the data layer queries local DB and all reachable servers in parallel, then merges by UUID. No duplicates in results — UUID deduplication is implicit.

10. **Write-local, sync-async**: All writes go to IndexedDB first (sub-millisecond, offline-safe). Sync is a background concern.
