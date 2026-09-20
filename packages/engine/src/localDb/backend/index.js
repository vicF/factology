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
// The fileIO interface expected by SQLiteAdapter:
//   { read(): Promise<Uint8Array>, write(Uint8Array): Promise<void> }

import { createDatabase } from '../schema.js';
import { SQLiteAdapter } from './sqliteAdapter.js';

const DB_FILENAME = 'factology_local.sqlite';

/**
 * Detect whether we're in a Node.js environment with access to require('fs').
 */
function hasNodeFS() {
    try {
        // In Electron renderer with contextIsolation, require may not exist.
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
    // Check for preload-exposed flag first (set in preload.js)
    if (typeof window !== 'undefined' && window.__factology_electron_fs) {
        return true;
    }
    // User-agent check
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
        // Capacitor 8+ exposes window.Capacitor
        return window.Capacitor && window.Capacitor.isNativePlatform();
    }
    return false;
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
    return {
        async read() {
            if (!fs.existsSync(dbPath)) {
                throw new Error('DB file not found');
            }
            return new Uint8Array(fs.readFileSync(dbPath));
        },
        async write(data) {
            const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(dbPath, Buffer.from(data));
        },
    };
}

/**
 * Create a Capacitor fileIO adapter using the Capacitor Filesystem plugin.
 */
function createCapacitorFileIO(dbName) {
    return {
        async read() {
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            // Try AppGroup for iOS (shared container), fall back to app data
            try {
                const result = await Filesystem.readFile({
                    path: dbName,
                    directory: Directory.AppGroup,
                    appGroupId: 'group.com.factology.shared', // configurable
                });
                return base64ToUint8(result.data);
            } catch {
                // Fallback: Application directory (not shared but functional)
                const result = await Filesystem.readFile({
                    path: dbName,
                    directory: Directory.ApplicationStorage,
                });
                return base64ToUint8(result.data);
            }
        },
        async write(data) {
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            const b64 = uint8ToBase64(data);
            try {
                await Filesystem.writeFile({
                    path: dbName,
                    data: b64,
                    directory: Directory.AppGroup,
                    appGroupId: 'group.com.factology.shared',
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
 * @param {object} [options]
 * @param {string} [options.dbName='factology_local']
 * @param {string} [options.dbPath] - Explicit path for the SQLite file (Node.js only)
 * @param {object} [options.fileIO] - Custom fileIO adapter (inject for testing)
 * @returns {Promise<SQLiteAdapter|Dexie>}
 */
export async function createBackend(options = {}) {
    const dbName = options.dbName || 'factology_local';
    const dbPath = options.dbPath;

    // 1. Custom fileIO injection (used by tests)
    if (options.fileIO) {
        const adapter = new SQLiteAdapter(options.fileIO);
        await adapter.init(dbName);
        return adapter;
    }

    // 2. Electron renderer with preload-exposed fs
    if (isElectronRenderer() && typeof window !== 'undefined' && window.__factology_electron_fs) {
        const fs = window.__factology_electron_fs;
        const resolvedPath = dbPath || `${require('node:os').homedir()}/.factology/${DB_FILENAME}`;
        const fileIO = {
            async read() {
                const data = fs.readFileSync(resolvedPath);
                return new Uint8Array(data);
            },
            async write(data) {
                const dir = resolvedPath.substring(0, resolvedPath.lastIndexOf('/'));
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(resolvedPath, Buffer.from(data));
            },
        };
        const adapter = new SQLiteAdapter(fileIO);
        await adapter.init(dbName);
        return adapter;
    }

    // 3. Node.js / Vitest / Electron main process
    if (hasNodeFS() || isTestEnv()) {
        const resolvedPath = dbPath || `${process.cwd()}/${DB_FILENAME}`;
        const fileIO = createNodeFileIO(resolvedPath);
        const adapter = new SQLiteAdapter(fileIO);
        await adapter.init(dbName);
        return adapter;
    }

    // 4. Capacitor (iOS/Android)
    if (isCapacitor()) {
        const fileIO = createCapacitorFileIO(DB_FILENAME);
        const adapter = new SQLiteAdapter(fileIO);
        await adapter.init(dbName);
        return adapter;
    }

    // 5. Browser fallback — Dexie / IndexedDB
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