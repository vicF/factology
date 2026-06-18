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

const isCapacitor = import.meta.env.VITE_TARGET === 'capacitor';
const apiBaseUrl = isCapacitor
    ? (import.meta.env.VITE_API_URL || '')
    : '/api/v1';
axios.defaults.baseURL = apiBaseUrl;

// ── Local API handler (lazy-loaded) ─────────────────────────────────
let localHandler = null;

async function getLocalHandler() {
    if (!localHandler) {
        const { handleLocalApiCall, handleLocalLinkCall, handleLocalUserCall, seedDemoData } = await import('./localDb/apiHandler');
        await seedDemoData();
        localHandler = { handleLocalApiCall, handleLocalLinkCall, handleLocalUserCall };
    }
    return localHandler;
}

/**
 * Route an axios config to the local DB handler.
 * Returns a resolved response object mimicking a server response.
 */
async function routeToLocal(config) {
    const handler = await getLocalHandler();
    const url = config.url?.replace(apiBaseUrl, '').split('?')[0] || '';
    const method = config.method?.toLowerCase() || 'get';
    const data = config.data;

    let result;
    if (url.startsWith('/user')) {
        result = await handler.handleLocalUserCall();
    } else if (url.startsWith('/link')) {
        result = await handler.handleLocalLinkCall(method, url, data);
    } else {
        result = await handler.handleLocalApiCall(method, url, data);
    }

    return {
        data: result.data,
        status: result.status,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config,
    };
}

// ── Axios interceptors for standalone mode ──────────────────────────

if (isCapacitor && !apiBaseUrl) {
    // FULL STANDALONE MODE: no server configured — all requests go to local DB.
    // Replace the default axios adapter so requests never hit the network.
    axios.defaults.adapter = async (config) => {
        const authStore = useAuthStore(pinia);
        await authStore.restoreAuth();
        if (authStore.token) {
            config.headers.Authorization = `Bearer ${authStore.token}`;
        }
        return routeToLocal(config);
    };
} else if (isCapacitor && apiBaseUrl) {
    // HYBRID MODE: server configured — try server first, fall back to local on network error.
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

            // Network error → fall back to local DB
            if (!error.response && error.config) {
                try {
                    return await routeToLocal(error.config);
                } catch {
                    return { ...error.config, data: { data: null, things: [] }, status: 200, statusText: 'OK' };
                }
            }

            return Promise.reject(error);
        }
    );
} else {
    // WEB MODE: normal axios behavior.
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
        error => {
            if (error.response?.status === 401) {
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
            return Promise.reject(error);
        }
    );
}

app.config.globalProperties.$dateFromDb = dateFromDb;

const authStore = useAuthStore();
await authStore.checkAuth();

app.mount('#app');
