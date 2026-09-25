// resources/js/localDb/standaloneBootstrap.js
//
// Bootstraps the local DB adapter for standalone (offline) mode.
// This module is ONLY imported in the Capacitor/standalone build
// (via main.capacitor.js), so it always sets up the adapter.
//
// No conditional checks — if this module is loaded, the adapter
// is always registered. The build system guarantees this module
// only loads in standalone mode.

import axios from 'axios';
import { initDb, getDb } from '@factology/engine/localDb/index.js';

const dbg = typeof window !== 'undefined' && window.dbg ? window.dbg : () => {};

/**
 * Set up the local Dexie adapter on axios.
 */
export async function bootstrapStandalone() {
    dbg('BS: bootstrapStandalone() start');

    // Initialize SQLite with shared storage (cross-app shared database).
    // Provide locateFile so sql.js's initSqlJs knows where to fetch
    // sql-wasm.wasm:
    //  - Node.js (vitest, Electron main): filesystem path relative to cwd
    //  - Browser (Vite dev, Capacitor):  URL served from /node_modules/
    //    (assetsInclude: ['**/*.wasm'] config ensures the correct MIME type)
    dbg('BS: initDb start');
    await initDb({
        sharedStorage: true,
        initSqlJsOptions: {
            locateFile: (file) => {
                if (typeof process !== 'undefined' && process.versions?.node) {
                    return `${process.cwd()}/node_modules/sql.js/dist/${file}`;
                }
                return `/node_modules/sql.js/dist/${file}`;
            },
        },
    });
    dbg('BS: initDb done');

    // Persist to disk immediately: the init creates an in-memory DB and saves
    // the empty schema, but the actual file-creation export happens async.  We
    // force a sync here so the directory exists by the time the user opens
    // the About page (no "[directory doesn't exist]").
    // Guard: Dexie (IndexedDB) auto-persists and has no save() — only
    // SQLiteAdapter needs explicit file writes.
    if (typeof getDb().save === 'function') {
        await getDb().save();
    }
    dbg('BS: save done');
    const { handleLocalApiCall, handleLocalLinkCall, handleLocalUserCall, seedDemoData } =
        await import('@factology/engine/localDb/apiHandler.js');
    dbg('BS: apiHandler imported');

    // Seed demo data on first run
    dbg('BS: seedDemoData() start');
    await seedDemoData();
    dbg('BS: seedDemoData() done');

    // Persist all seeded/migrated data to disk.  Without this call the database
    // lives entirely in memory — the SQLite file on disk would never be created
    // (or would stay empty), and data from the Dexie→SQLite migration would be
    // lost on restart.
    // Guard: Dexie (IndexedDB) auto-persists and has no save().
    if (typeof getDb().save === 'function') {
        await getDb().save();
    }
    dbg('BS: save after seed done');

    // Resolve the on-device images folder so thumb URLs are stable from the
    // first render (offline native builds).
    try {
        dbg('BS: initDeviceThumbs() start');
        const { initDeviceThumbs } = await import('@factology/engine/media/deviceImages.js');
        await initDeviceThumbs();
        dbg('BS: initDeviceThumbs() done');
    } catch (e) {
        dbg('BS: initDeviceThumbs() failed: ' + (e?.message || String(e)));
    }

    dbg('BS: importing stores');
    const { useAuthStore } = await import('../stores/auth');
    const { useIdentityStore } = await import('../stores/identity');
    dbg('BS: stores imported, registering adapter');

    // Register the custom adapter
    axios.defaults.adapter = async (config) => {
        const authStore = useAuthStore();
        const identityStore = useIdentityStore();
        await authStore.restoreAuth();
        if (authStore.token) {
            config.headers.Authorization = `Bearer ${authStore.token}`;
        }
        await identityStore.restore();

        // Keep the full URL: the local handlers parse `?depth=N` themselves
        // (GET /object/{id}?depth=N, GET /object/{id}/graph?depth=N). Only the
        // exact-path comparisons below use the query-less part.
        const url = config.url || '';
        const path = url.split('?')[0];
        const method = config.method?.toLowerCase() || 'get';
        const data = config.data;

        // In the offline app the (unlocked) PRIMARY identity IS the session
        // owner: new objects belong to it. `visibleOwners` feeds the owner
        // visibility filter — null disables filtering (no identity stored yet).
        const context = {
            // Only an UNLOCKED identity may own new data offline. authStore's
            // user is just the session mirror of that identity (set by
            // identityStore.refreshSession), so we do not fall back to it.
            userThingId: identityStore.primary?.thingId || null,
            visibleOwners: identityStore.currentVisibleOwners(),
        };

        // Guest (no unlocked identity) is read-only: creating/editing/deleting
        // objects and links requires an identity so the new data has an owner.
        const isObjectWrite = path.startsWith('/object') && ['post', 'put', 'delete'].includes(method)
            && !/^\/object\/?$/.test(path); // bare POST /object is a search, not a write
        const isLinkWrite = path.startsWith('/link') && ['post', 'put', 'delete'].includes(method);
        if (!context.userThingId && (isObjectWrite || isLinkWrite)) {
            throw {
                response: {
                    status: 403,
                    data: { message: 'Offline data is read-only until you create or import an identity.' },
                },
            };
        }

        let result;
        if (path === '/user' || path === 'user') {
            // The unlocked identity is the session user — /user must report IT,
            // not a stand-in, or boot-time checkAuth() overwrites the identity
            // session and edit/delete lose owner match.
            result = await handleLocalUserCall({
                userThingId: identityStore.primary?.thingId || null,
                userName: identityStore.primary?.name || null,
            });
        } else if (path === '/register' || path === 'register' || path === '/login' || path === 'login') {
            // Simulate register/login in offline mode
            const body = typeof data === 'string' ? JSON.parse(data) : (data || {});
            const userData = {
                id: Date.now(),
                name: body.name || 'Offline User',
                email: body.email || 'offline@local',
                thing_id: `local-user-${Date.now()}`,
            };
            result = {
                data: { user: userData, token: `local-token-${Date.now()}` },
                status: 200,
            };
        } else if (path.startsWith('/logout')) {
            result = { data: { success: true }, status: 200 };
        } else if (path.startsWith('/link')) {
            // Link routes carry their id in the path; strip any query so it is
            // never parsed as part of the link id.
            result = await handleLocalLinkCall(method, path, data);
        } else {
            result = await handleLocalApiCall(method, url, data, context);
        }

        return {
            data: result.data,
            status: result.status,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            config,
        };
    };
}

// No self-run: main.capacitor.js awaits bootstrapStandalone() before it
// evaluates ./app, so every request goes through the adapter from the first
// call. (When this module ran itself, the imports of app.js and this file were
// siblings and app.js's initial API calls raced the adapter setup.)
