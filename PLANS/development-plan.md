# Factology Multi-Platform Development Plan

## Overview
Upgrade the Factology application to support:
- **Local mobile**: Android, iOS (via Capacitor — already configured)
- **Desktop**: Windows, Linux (via Electron — already configured)
- **Web SPA**: Using the same API as standalone apps
- **Offline-first**: Full offline capability with local storage
- **UUID-based sync**: Merge/sync between local storage and multiple server APIs
- **Permissions**: Private, public, group-visible, server-saved records

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
  - `push()` — accept client changes, detect conflicts (where server updated since client's last sync), return conflicts
  - `resolveConflict()` — apply resolution
- Add `record_updated` and `sync_version` columns to `things`/`links` tables (if not present — `things.record_updated` already exists)
- Create `app/Http/Controllers/SyncController.php`

### 2.3 Client-Side Sync Engine
- `resources/js/sync/SyncEngine.js`:
  - `sync()` — pull→merge→push pipeline
  - `pullFromServer()` — fetch server changes since last sync
  - `pushToServer()` — send pending local changes, handle conflicts
  - `mergeServerChanges()` — apply server changes to local DB
  - `resolveConflicts()` — apply conflict resolution strategies
- `resources/js/sync/ConflictResolver.js`:
  - Last-write-wins (default, using `_serverRevision` vs `_localRevision`)
  - Manual merge (flag for user review)
  - Field-level merge strategies

### 2.4 Background Sync
- Register periodic sync when online (every 30s default, configurable)
- Use `navigator.serviceWorker` for background sync on web
- Use Capacitor Background Task plugin for mobile

---

## Phase 3: Permissions & Policies

### 3.1 Database Layer — Permissions
Tables already exist: `things_access`, `links_access` (with `group_id`, `read`, `write`). They need integration into the application logic.

Add new migration:
```php
// Add visibility column to things
$table->enum('visibility', ['private', 'public', 'server', 'group'])->default('private');
// Add server_id to things (which server this record belongs to)
$table->uuid('server_id')->nullable();
```

### 3.2 Create Policy Framework
- `app/Policies/ThingPolicy.php` — defines who can view/edit/delete a thing
- `app/Policies/LinkPolicy.php` — defines who can view/edit/delete a link
- Register policies in `app/Providers/AuthServiceProvider.php`

### 3.3 Visibility Rules
| Visibility | Read | Default Write | Editable By Others | Sync |
|---|---|---|---|---|
| `private` | Owner only | Owner only | No | Local only (never pushed) |
| `server` (server-saved) | Owner only | Owner only | No | Push/pull to specific server |
| `group` (group-visible) | Group members + owner | Owner only | If owner grants write to group | Push/pull to server, server serves to group |
| `public` | Anyone | Owner only | If owner grants edit permission | Push/pull to all servers |

**Other-user edits** (TBD — two approaches to implement):
- **Approach A (Manual merge)**: Other user's edit creates a pending change. Owner reviews and accepts/rejects.
- **Approach B (Copy-on-edit)**: Other user's edit creates a new thing linked to the original. Owner can merge later by accepting the new thing's data.

Both approaches use field-level diffing — only changed fields are tracked.

### 3.4 Group Management
- Create `app/Http/Controllers/GroupController.php`:
  - Create group (a thing with type=group)
  - Add/remove members (link to group)
  - Set group permissions on things/links
- Add API routes for group management
- `resources/js/components/GroupManager.vue` — UI for managing groups

### 3.5 Apply Policies to API Controllers
- Update `ApiController` to check policies:
  - `list()` — filter by visibility + ownership + group membership
  - `get()` — check read permission via policy
  - `store()`/`update()` — check write permission via policy
  - `delete()` — check delete permission via policy
- Apply `auth()` scope consistently (already partially in search query)

### 3.6 Server Registry
- `servers` table (or reuse things with type=server):
  - id, name, url, auth_type, auth_config (encrypted)
- `resources/js/stores/serverRegistry.js` — manage list of known servers
- Allow user to add/remove servers
- When syncing: iterate over registered servers

---

## Phase 4: Multi-Platform Adaptation

### 4.1 Unify Data Access Layer
- `resources/js/dataLayer/index.js`:
  - `getObject(uuid)` — try local DB first, fall back to cache, then API
  - `saveObject(uuid, data)` — write to local DB, enqueue for sync
  - `searchObjects(params)` — search local DB + optionally query API
- All Pinia stores (objects, objectCache, search) should use the data layer instead of direct API calls

### 4.2 Offline-First UI
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

1. **Phase 1** (Local Storage) + **Phase 2.3** (Client Sync) — get offline working end-to-end first
2. **Phase 2.1-2.2** (Server Sync API) — connect to backend
3. **Phase 3** (Permissions) — add access control
4. **Phase 4** (Multi-Platform) — polish platform-specific features
5. **Phase 5** (Media Sync) — handle photos/files
6. **Phase 6** (Testing) — continuously alongside each phase, not just at the end

---

## Key Design Decisions

1. **UUID everywhere**: The system already uses UUIDs for all records (things, links, media). This is correct for distributed sync — no ID conflicts across servers/clients.

2. **Everything is a "thing"**: Users, groups, servers, link types, class types — all are things in the `things` table. This unified entity model means permissions, sync, and relationships all work the same way for every object in the system.

3. **Field-level diffing**: Edits track which fields changed (name, description, data JSON, etc.). Merge can apply non-conflicting field changes automatically. Conflicting fields (both users changed the same field) require manual resolution.

4. **Other-user edits** (undecided — two approaches):  
   - **A) Manual merge**: Owner reviews pending edits and accepts/rejects.  
   - **B) Copy-on-edit**: Edits by non-owners create a new linked thing (fork). Owner can merge the fork's data later.

5. **Local-first, not remote-first**: The local database is the source of truth. Server API is a sync target. This enables full offline use.

6. **Visibility = sync behavior**: The `visibility` field controls what syncs where. Private records never leave the device. Server records go to a specific server. Public records sync everywhere. Group records sync to servers where the group exists.

7. **Servers hold subsets**: Each record belongs to a specific server (or is local-only). Different servers can hold different subsets of data. Public records can be synced to multiple servers.
