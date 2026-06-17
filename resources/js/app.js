import './bootstrap';
import '../sass/app.scss';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { useAuthStore } from './stores/auth';
import { dateFromDb } from './utils/dateUtils.js';
const pinia = createPinia();

import App from './components/App.vue';
import router from './router';
import i18n from './lang/i18n';
import LinkDescription from './components/LinkDescription.vue';

// Import all icons
import * as Icons from './components/icons';
import '../css/app.css';

const app = createApp(App);
app.use(router);
app.use(i18n);
app.use(pinia);

// Register all icons globally
Object.entries(Icons).forEach(([name, component]) => {
    app.component(name, component);
});

// Глобальная регистрация
app.component('LinkDescription', LinkDescription);

app.config.globalProperties.$truncateText = function(text, length) {
    if (text.length <= length) {
        return text;
    }
    let trimmed = text.substr(0, length);
    return trimmed.substr(0, Math.min(trimmed.length, trimmed.lastIndexOf(" "))) + ' ...';
};

app.config.globalProperties.$navigateToObject = function(id) {
    this.$router.push({ name: 'object', params: { uid: id } });
};

import axios from 'axios';

axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
axios.defaults.headers.common['Accept'] = 'application/json';

// Base URL: in Capacitor builds, point to the remote API server.
// In web SPA mode, use relative URLs (proxied by Laravel).
const isCapacitor = import.meta.env.VITE_TARGET === 'capacitor';
const apiBaseUrl = isCapacitor
    ? (import.meta.env.VITE_API_URL || '')
    : '/api/v1';
axios.defaults.baseURL = apiBaseUrl;

// ── Offline fallback for Capacitor/standalone builds ──────────────────
// When the API server is unreachable, route requests through the local DB.
let localHandler = null;
let standaloneMode = false;
let serverChecked = false;

async function tryServer() {
    if (!isCapacitor || !apiBaseUrl) return false;
    try {
        await fetch(apiBaseUrl + '/object?limit=1', {
            method: 'HEAD',
            signal: AbortSignal.timeout(3000),
        });
        return true;
    } catch {
        return false;
    }
}

async function getLocalHandler() {
    if (!localHandler) {
        const { handleLocalApiCall, handleLocalLinkCall, handleLocalUserCall, seedDemoData } = await import('./localDb/apiHandler');
        await seedDemoData();
        localHandler = { handleLocalApiCall, handleLocalLinkCall, handleLocalUserCall };
    }
    return localHandler;
}

// Automatically add Authorization header with Bearer token when available
axios.interceptors.request.use(async config => {
    const authStore = useAuthStore(pinia);
    await authStore.restoreAuth();
    if (authStore.token) {
        config.headers.Authorization = `Bearer ${authStore.token}`;
    }
    return config;
});

axios.interceptors.response.use(
    response => response,
    async error => {
        const status = error.response?.status;

        if (status === 401) {
            if (error.config?.noAuthRedirect) {
                return Promise.reject(error);
            }
            if (!router.currentRoute.value.fullPath.includes('/login') &&
                !router.currentRoute.value.fullPath.includes('/register')) {
                router.push({
                    name: 'login',
                    query: { redirect: router.currentRoute.value.fullPath || '/' }
                });
            }
        }

        // Network error (offline) → fall back to local DB
        if (isCapacitor && !error.response && error.config) {
            const handler = await getLocalHandler();
            const url = error.config.url?.replace(apiBaseUrl, '') || '';
            const method = error.config.method?.toLowerCase() || 'get';
            const data = error.config.data;

            try {
                let result;
                if (url.startsWith('/user')) {
                    result = await handler.handleLocalUserCall();
                } else if (url.startsWith('/link')) {
                    result = await handler.handleLocalLinkCall(method, url, data);
                } else {
                    result = await handler.handleLocalApiCall(method, url, data);
                }
                return Promise.resolve({
                    ...error.config,
                    status: result.status,
                    statusText: 'OK (local)',
                    data: result.data,
                });
            } catch (localError) {
                // If local handler also fails, return empty success
                return Promise.resolve({
                    ...error.config,
                    status: 200,
                    statusText: 'OK (local fallback)',
                    data: { data: null, things: [] },
                });
            }
        }

        return Promise.reject(error);
    }
);

app.config.globalProperties.$dateFromDb = dateFromDb;

const authStore = useAuthStore();
await authStore.checkAuth();

// In capacitor standalone mode, check server and seed local DB
if (isCapacitor) {
    getLocalHandler().then(() => {
        console.log('Local DB ready for standalone mode');
    });
}

app.mount('#app');
