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
import { createDatabase } from './schema';

// Initialize the database schema immediately
createDatabase();

/**
 * Set up the local Dexie adapter on axios.
 * Replaces the default HTTP adapter with one that routes all
 * requests to the local IndexedDB database.
 */
export async function bootstrapStandalone() {
    const { handleLocalApiCall, handleLocalLinkCall, handleLocalUserCall, seedDemoData } =
        await import('./apiHandler');

    // Seed demo data on first run
    await seedDemoData();

    const { useAuthStore } = await import('../stores/auth');
    const { useIdentityStore } = await import('../stores/identity');

    // Register the custom adapter
    axios.defaults.adapter = async (config) => {
        const authStore = useAuthStore();
        const identityStore = useIdentityStore();
        await authStore.restoreAuth();
        if (authStore.token) {
            config.headers.Authorization = `Bearer ${authStore.token}`;
        }
        await identityStore.restore();

        const url = config.url?.split('?')[0] || '';
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
        const isObjectWrite = url.startsWith('/object') && ['post', 'put', 'delete'].includes(method)
            && !/^\/object\/?$/.test(url); // bare POST /object is a search, not a write
        const isLinkWrite = url.startsWith('/link') && ['post', 'put', 'delete'].includes(method);
        if (!context.userThingId && (isObjectWrite || isLinkWrite)) {
            throw {
                response: {
                    status: 403,
                    data: { message: 'Offline data is read-only until you create or import an identity.' },
                },
            };
        }

        let result;
        if (url === '/user' || url === 'user') {
            result = await handleLocalUserCall();
        } else if (url === '/register' || url === 'register' || url === '/login' || url === 'login') {
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
        } else if (url.startsWith('/logout')) {
            result = { data: { success: true }, status: 200 };
        } else if (url.startsWith('/link')) {
            result = await handleLocalLinkCall(method, url, data);
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

// Run immediately (awaited so the import() waits for adapter setup)
await bootstrapStandalone();
