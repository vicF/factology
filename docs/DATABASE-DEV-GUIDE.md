# Factology Database Developer Guide

This document describes the conventions and requirements for any Factology-family
application (Factology, SetTempo, Pawlo, etc.) that uses the local database layer.

## Architecture

All Factology apps use **sql.js** — SQLite compiled to WASM — running entirely in
process memory. The full database is loaded as a `Uint8Array` buffer from a
`.sqlite` file at startup, all operations run in-memory, and the entire state is
serialized back to the file on save/auto-save.

This is **not** a client-server SQLite. There is no separate process mediating
concurrent access. Every app instance reads and writes the full database blob as
a single atomic unit.

## Two approaches to cross-app data sharing

There are two distinct strategies for handling multiple apps on the same device.
You must choose one per app — they do not mix.

### Approach A: shared SQLite file (current, last-writer-wins)

All apps resolve to the **same** canonical `.sqlite` file path:

| Platform  | Path                                     |
|-----------|------------------------------------------|
| Desktop   | `~/.factology/factology_local.sqlite`    |
| Android   | `Documents/factology/factology_local.sqlite` |
| iOS       | AppGroup `group.com.factology.shared`    |
| Vitest    | `cwd()/factology_local.sqlite`           |

Use `createBackend({ sharedStorage: true })` to get this path automatically.

**How it works:** each app reads the entire DB into memory, operates on it, and
writes the full blob back. The last app to save overwrites any previous changes.
This is **last-writer-wins** — there is no merge.

**When it works well:** when the user works in one app at a time (typical usage).
Focus-save (see below) flushes data on blur so the next app reads current data.

**Limitations:**
- Two apps saving concurrently: one app's changes silently overwrite the other's
- No conflict detection, no merge
- A long-running background writer could clobber foreground changes

Approach A is simple and sufficient for personal single-user workflows. It does
NOT require any sync protocol.

### Approach B: separate databases + JSON sync (future, recommended for multi-app)

Each app maintains its **own** `.sqlite` file (not shared). Data exchange happens
through incremental JSON export/import — one app writes JSON change files to a
shared directory, another reads and merges them.

This requires building a sync protocol on top of the database layer. The data
model supports this:

1. All entities have stable UUIDs (no auto-increment)
2. Timestamps are tracked for conflict resolution
3. Incremental exports cover only changed data since last sync
4. Import merges by UUID (upsert), never wipe-and-replace

Detailed design: [MULTI-INSTANCE-SYNC.md](MULTI-INSTANCE-SYNC.md)

Approach B is the correct long-term solution for multi-app collaboration, but
it has not been implemented yet — this guide will be updated when it is.

## Mandatory requirements (both approaches)

The following requirements apply regardless of which approach you use.

### Atomic writes (MANDATORY)

Every `write()` implementation **MUST** use the **temp-file-then-rename** pattern:

```
write data → writeFileSync(.tmp.PID) → renameSync(.tmp.PID, .sqlite)
```

- `renameSync()` is atomic on NTFS, ext4, and APFS when source and destination
  are on the same filesystem. A power failure during `writeFileSync` destroys
  only the `.tmp.PID` file — the `.sqlite` file is never truncated.
- Use `process.pid` in the temp file name to avoid clashes between concurrent
  processes. A fixed path like `.tmp` shared between two processes would let the
  second process overwrite the first's temp, causing logical data corruption.

**Never** write directly to the `.sqlite` path. An in-place overwrite that is
interrupted by a power failure corrupts the file irrecoverably.

This applies to ALL platforms: Electron (preload), Node.js (scripts, Vitest),
Capacitor (iOS/Android), and any future platform.

```js
// Node.js / Electron preload:
const tmpPath = dbPath + '.tmp.' + process.pid;
fs.writeFileSync(tmpPath, Buffer.from(data));
fs.renameSync(tmpPath, dbPath);
```

### Periodic backups (MANDATORY)

Every `write()` implementation **MUST** periodically keep a rolling copy of the
entire database as `dbPath.bak`, using the same atomic-write pattern:

```
every 30 writes (~60 seconds at 2s auto-save):
  writeFileSync(.bak.tmp.PID, data) → renameSync(.bak.tmp.PID, .sqlite.bak)
```

The `.bak` file is a **full copy** of the `.sqlite` file at that point in time.
The `.bak.tmp.PID` is just an intermediate temp file (gone after rename) — the
same atomic-write pattern applied to the backup itself.

The `.bak` provides recovery if the primary `.sqlite` file is corrupted by
external causes (filesystem bug, antivirus quarantine, user error). On startup,
if `.sqlite` is missing but `.bak` exists, the fileIO should restore from backup
automatically.

**Why not just `fs.copyFile(dbPath, bakPath)`?** Without atomic write, a power
failure during `copyFile` would leave a truncated `.bak` file. The temp+rename
pattern ensures the backup itself is never half-written.

### Focus-save (MANDATORY — Approach A only)

When using the shared SQLite file (Approach A), every app **MUST** save the
database immediately when the application window loses focus (blur). This
flushes pending writes to the `.sqlite` file so the next app that reads it
gets current data.

On focus gain, do **not** reload or re-read the database. Since the entire DB
is a single blob, a reload would discard the current in-memory state without
a meaningful merge. Approach B (separate DBs + JSON sync) exists specifically
to solve this.

#### Electron

The main process forwards `BrowserWindow.on('blur')` to the renderer via
`webContents.send('window-focus-change', 'blur')`. The preload listens for
this event and calls the renderer-registered callback (`getDb().save()`).

Reference implementations:
- `electron/src/main.js` — window event forwarding (blur and focus both sent;
  the renderer only handles blur)
- `electron/src/preload.js` — IPC listener + contextBridge export
- `resources/js/main.capacitor.js` — renderer handler registration (blur only)

#### Capacitor / Browser

Use the `document.visibilitychange` event as the closest available approximation.
On `document.hidden`, trigger `getDb().save()`. This fires on browser tab switch,
device sleep, and mobile app backgrounding.

#### Other platforms

If native window focus events are not available, use the platform's equivalent of
application suspend/background notification. At minimum, save on application exit.

### Application exit

Every app **MUST** call `getDb().close()` on exit. This flushes pending writes
and frees the sql.js WASM handle. In Electron, this is handled automatically by
the `will-quit` hook — other platforms need their own equivalent.

## FileIO interface

The database backend uses an abstract `fileIO` interface:

```js
{
  read(): Promise<Uint8Array>,
  write(Uint8Array): Promise<void>
}
```

All implementations of this interface MUST implement the atomic write pattern
and periodic backups described above. The interface may be extended with
additional methods but must remain backward-compatible.

## Testing

When writing tests that touch the database:

- Vitest tests use `cwd()/factology_local.sqlite` — separate from the main app DB
- Always call `getDb().save()` after seeding test data to ensure it's on disk
- Clean up `.sqlite`, `.bak`, and `.tmp.*` files between test runs
- Do NOT mock the fileIO unless testing corruption scenarios

## Checklist for new Factology apps

- [ ] Choose Approach A (shared file) or Approach B (separate DBs + JSON sync)
- [ ] fileIO `write()` uses temp-file-then-rename (atomic write)
- [ ] fileIO `write()` creates periodic `.bak` copies (every ~30 writes)
- [ ] fileIO `read()` falls back to `.bak` if `.sqlite` is missing
- [ ] Application exit triggers `getDb().close()` (flushes pending writes)
- [ ] Orphaned `.tmp.PID` files are cleaned up on startup
- [ ] If Approach A: window blur triggers `getDb().save()` (focus-save)