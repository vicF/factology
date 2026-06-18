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

    // Register the custom adapter
    axios.defaults.adapter = async (config) => {
        const authStore = useAuthStore();
        await authStore.restoreAuth();
        if (authStore.token) {
            config.headers.Authorization = `Bearer ${authStore.token}`;
        }

        const url = config.url?.split('?')[0] || '';
        const method = config.method?.toLowerCase() || 'get';
        const data = config.data;

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
            result = await handleLocalApiCall(method, url, data);
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
