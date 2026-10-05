// packages/engine/src/localDb/backend/index.js
//
// Runtime backend detection — creates a SQLiteAdapter or falls back to Dexie.
//
// Platform detection order:
//   1. Electron renderer        → SQLite via node:fs exposed through preload
//   2. Node.js (Vitest/Electron main)  → SQLite via node:fs directly
//   3. Capacitor (iOS/Android)  → SQLite via Capacitor Filesystem plugin
//   4. Browser without fs       → Dexie (IndexedDB) fallback
//
// SHARED STORAGE (sharedStorage: true in options):
//   All apps from the same developer (Factology, SetTempo, Pawlo) that
//   call createBackend({ sharedStorage: true }) resolve to the same
//   canonical file path on the device, enabling cross-app data sharing.
//
//   Android:  Documents/factology/factology_local.sqlite
//   iOS:      AppGroup (group.com.factology.shared) via Capacitor Filesystem
//   Desktop:  ~/.factology/factology_local.sqlite
//   Vitest:   cwd()/factology_local.sqlite   (same as non-shared — test scope)
//
// The fileIO interface expected by SQLiteAdapter:
//   { read(): Promise<Uint8Array>, write(Uint8Array): Promise<void> }

import { createDatabase } from '../schema.js';
import { SQLiteAdapter } from './sqliteAdapter.js';

const DB_FILENAME = 'factology_local.sqlite';
const SHARED_DIR = 'factology';              // subdir under Documents (Android)
const APP_GROUP_ID = 'group.com.factology.shared';

/**
 * Detect whether we're in a Node.js environment with access to require('fs').
 */
function hasNodeFS() {
    try {
        return typeof process !== 'undefined'
            && process.versions
            && process.versions.node
            && typeof require === 'function';
    } catch {
        return false;
    }
}

/**
 * Detect Electron renderer (via preload-exposed flag or userAgent).
 */
function isElectronRenderer() {
    if (typeof window !== 'undefined' && window.__factology_electron_fs) {
        return true;
    }
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
        return /electron/i.test(navigator.userAgent);
    }
    return false;
}

/**
 * Detect Capacitor (iOS/Android WebView).
 */
function isCapacitor() {
    if (typeof window !== 'undefined') {
        return window.Capacitor && window.Capacitor.isNativePlatform();
    }
    return false;
}

/**
 * Detect test-mode Capacitor build (VITE_FACTOLOGY_TEST_MODE=true).
 * The test APK stores its SQLite database in Directory.Cache (ephemeral)
 * instead of Documents/factology/ so it never touches the real app DB.
 */
function isCapacitorTestMode() {
    try {
        return typeof import.meta !== 'undefined'
            && import.meta.env
            && import.meta.env.VITE_FACTOLOGY_TEST_MODE === 'true';
    } catch {
        return false;
    }
}

/**
 * Detect Vitest / test environment.
 */
function isTestEnv() {
    return typeof process !== 'undefined'
        && (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test');
}

/**
 * Create a Node.js fileIO adapter using the built-in fs module.
 */
function createNodeFileIO(dbPath) {
    const fs = require('node:fs');
    // Unique temp path per process so concurrent processes don't clash.
    // Within one process, writeFileSync is synchronous — no intra-process race.
    const tmpPath = dbPath + '.tmp.' + process.pid;
    const bakPath = dbPath + '.bak';
    const bakTmp = bakPath + '.tmp.' + process.pid;
    let writeCount = 0;
    return {
        async read() {
            // Best-effort cleanup of orphaned .tmp file from a prior crash.
            // Not critical — the .sqlite file is always intact after an atomic
            // write, the .tmp is just debris.
            try { fs.removeSync(tmpPath); } catch (e) {}
            if (!fs.existsSync(dbPath)) {
                // If .sqlite is missing but a .bak exists, restore from backup.
                // This covers filesystem-level deletion or a corrupt-file recovery
                // where the caller chose to delete and restart.
                if (fs.existsSync(bakPath)) {
                    const bakData = new Uint8Array(fs.readFileSync(bakPath));
                    fs.writeFileSync(tmpPath, Buffer.from(bakData));
                    fs.renameSync(tmpPath, dbPath);
                    return bakData;
                }
                throw new Error('DB file not found');
            }
            return new Uint8Array(fs.readFileSync(dbPath));
        },
        async write(data) {
            const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Atomic write: write to temp file first, then rename over the
            // real file.  rename() is atomic on the same filesystem (NTFS,
            // ext4, APFS), so a power failure during writeFileSync destroys
            // only the .tmp copy — the .sqlite file is never truncated.
            // Without this, an in-place overwrite that gets interrupted
            // corrupts the file irrecoverably.
            fs.writeFileSync(tmpPath, Buffer.from(data));
            fs.renameSync(tmpPath, dbPath);

            // Periodic backup: every 30 writes (~60s at 2s auto-save interval),
            // keep a point-in-time copy that can be restored if the primary DB
            // file is lost or corrupted by external causes (filesystem bug,
            // antivirus quarantine, user error).  Uses the same atomic-write
            // pattern so the backup itself is never half-written.
            writeCount++;
            if (writeCount % 30 === 0) {
                fs.writeFileSync(bakTmp, Buffer.from(data));
                fs.renameSync(bakTmp, bakPath);
            }
        },
    };
}

/**
 * Create a Capacitor fileIO adapter using the Capacitor Filesystem plugin.
 *
 * @param {string}  dbName        - Database filename (e.g. 'factology_local.sqlite')
 * @param {boolean} sharedStorage - If true, use a shared directory (AppGroup on iOS,
 *                                  Documents/factology on Android) so multiple apps
 *                                  from the same developer share one SQLite file.
 * @param {boolean} testMode      - If true, use Directory.Cache (ephemeral) so tests
 *                                  never touch the real app database.
 */
function createCapacitorFileIO(dbName, sharedStorage = false, testMode = false) {
    const testDbName = 'factology_test.sqlite';
    // TODO: Add atomic-write (temp+rename) and periodic-backup support
    // via the Capacitor Filesystem plugin. The current implementation
    // writes in-place, which is vulnerable to power-failure corruption
    // on iOS/Android. Requires plugin support for atomic renames or a
    // write-then-verify pattern.
    return {
        async read() {
            const { Filesystem, Directory } = await import('@capacitor/filesystem');

            // Test mode: use Cache directory (ephemeral, cleared on restart)
            if (testMode) {
                try {
                    const result = await Filesystem.readFile({
                        path: testDbName,
                        directory: Directory.Cache,
                    });
                    return base64ToUint8(result.data);
                } catch {
                    throw new Error('Test DB not found');
                }
            }

            let result;
            if (sharedStorage) {
                // iOS: AppGroup shared container
                try {
                    result = await Filesystem.readFile({
                        path: dbName,
                        directory: Directory.AppGroup,
                        appGroupId: APP_GROUP_ID,
                    });
                    return base64ToUint8(result.data);
                } catch {
                    // Android: Documents/factology/<dbName> — accessible by all
                    // apps signed with the same developer certificate.
                    result = await Filesystem.readFile({
                        path: `/${SHARED_DIR}/${dbName}`,
                        directory: Directory.Documents,
                    });
                    return base64ToUint8(result.data);
                }
            }
            // Non-shared: app-private ApplicationStorage
            try {
                result = await Filesystem.readFile({
                    path: dbName,
                    directory: Directory.AppGroup,
                    appGroupId: APP_GROUP_ID,
                });
                return base64ToUint8(result.data);
            } catch {
                result = await Filesystem.readFile({
                    path: dbName,
                    directory: Directory.ApplicationStorage,
                });
                return base64ToUint8(result.data);
            }
        },
        async write(data) {
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            const b64 = uint8ToBase64(data);

            // Test mode: write to Cache directory
            if (testMode) {
                await Filesystem.writeFile({
                    path: testDbName,
                    data: b64,
                    directory: Directory.Cache,
                });
                return;
            }

            if (sharedStorage) {
                try {
                    await Filesystem.writeFile({
                        path: dbName,
                        data: b64,
                        directory: Directory.AppGroup,
                        appGroupId: APP_GROUP_ID,
                    });
                    return;
                } catch {
                    await Filesystem.writeFile({
                        path: `/${SHARED_DIR}/${dbName}`,
                        data: b64,
                        directory: Directory.Documents,
                    });
                    return;
                }
            }
            try {
                await Filesystem.writeFile({
                    path: dbName,
                    data: b64,
                    directory: Directory.AppGroup,
                    appGroupId: APP_GROUP_ID,
                });
            } catch {
                await Filesystem.writeFile({
                    path: dbName,
                    data: b64,
                    directory: Directory.ApplicationStorage,
                });
            }
        },
    };
}

/**
 * Create a database backend — either SQLiteAdapter or Dexie.
 *
 * @param {object}  [options]
 * @param {string}  [options.dbName='factology_local']
 * @param {string}  [options.dbPath]       - Explicit path for the SQLite file (Node.js only)
 * @param {object}  [options.fileIO]       - Custom fileIO adapter (inject for testing)
 * @param {boolean} [options.sharedStorage] - Use shared storage path (cross-app sharing)
 * @returns {Promise<SQLiteAdapter|Dexie>}
 */
export async function createBackend(options = {}) {
    const dbName = options.dbName || 'factology_local';
    const dbPath = options.dbPath;
    const sharedStorage = options.sharedStorage === true;
    const initSqlJsOptions = options.initSqlJsOptions || {};

    // 1. Custom fileIO injection (used by tests)
    if (options.fileIO) {
        const adapter = new SQLiteAdapter(options.fileIO, initSqlJsOptions);
        await adapter.init(dbName);
        return adapter;
    }

    // 2. Electron renderer with preload-exposed fs
    if (isElectronRenderer() && typeof window !== 'undefined' && window.__factology_electron_fs) {
        const fs = window.__factology_electron_fs;
        // Preload resolves FACTOLOGY_DB_PATH and the default path in Node.js
        // context and exposes it as window.__factology_db_path.  No process.env
        // references here — Vite's renderer has no `process` global.
        const resolvedPath = dbPath || window.__factology_db_path;
        const fileIO = {
            async read() {
                const data = fs.readFileSync(resolvedPath);
                return new Uint8Array(data);
            },
            async write(data) {
                // The preload's writeFileSync handles directory creation itself
                // (via path.dirname + mkdirSync recursive), so no split-on-slash
                // dance is needed — that would break on Windows backslash paths.
                // Also: no Buffer.from() wrapper — Buffer is undefined in Vite's
                // renderer context, and Node's fs.writeFileSync accepts Uint8Array.
                fs.writeFileSync(resolvedPath, data);
            },
        };
        const adapter = new SQLiteAdapter(fileIO, initSqlJsOptions);
        await adapter.init(dbName);
        return adapter;
    }

    // 3. Node.js / Vitest / Electron main process
    if (hasNodeFS() || isTestEnv()) {
        const resolvedPath = dbPath || process.env.FACTOLOGY_DB_PATH || `${process.cwd()}/${DB_FILENAME}`;
        const fileIO = createNodeFileIO(resolvedPath);
        const adapter = new SQLiteAdapter(fileIO, initSqlJsOptions);
        await adapter.init(dbName);
        return adapter;
    }

    // 4. Capacitor (iOS/Android) — uses shared or app-private storage
    if (isCapacitor()) {
        const testMode = isCapacitorTestMode();
        const fileIO = createCapacitorFileIO(DB_FILENAME, sharedStorage, testMode);
        const adapter = new SQLiteAdapter(fileIO, initSqlJsOptions);
        await adapter.init(dbName);
        return adapter;
    }

    // 5. Browser fallback — Dexie / IndexedDB
    if (isElectronRenderer()) {
        console.warn('[engine/localDb] Electron renderer detected but no preload-exposed fs '
            + '(window.__factology_electron_fs missing). Falling back to Dexie/IndexedDB '
            + 'instead of the shared SQLite database.');
    }
    return createDatabase();
}

// ---------------------------------------------------------------------------
// Base64 ↔ Uint8Array helpers (Capacitor Filesystem uses base64 strings)
// ---------------------------------------------------------------------------

function base64ToUint8(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function uint8ToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}