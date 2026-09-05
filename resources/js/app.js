import './bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../css/app.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { useAuthStore } from './stores/auth';
import { useObjectHistoryStore } from './stores/objectHistory';
import { dateFromDb } from './utils/dateUtils.js';
const pinia = createPinia();

import App from './components/App.vue';
import router from './router';
import i18n from './lang/i18n';
import LinkDescription from './components/LinkDescription.vue';
import TranslatedBadge from './components/TranslatedBadge.vue';

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
app.component('TranslatedBadge', TranslatedBadge);

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

// ── Error tracking setup ────────────────────────────────────
import {
    installVueErrorHandler,
    installGlobalHandlers,
    trackError,
    reportToServer,
    shouldIgnoreError as trackerShouldIgnore,
    onError as trackerOnError,
} from './utils/errorTracker.js';

installVueErrorHandler(app);
installGlobalHandlers();

// ── In-app error log (visible on /logs, copyable) ────────────────────────
// Packaged Electron/Android builds have no DevTools, so capture console /
// window / promise errors into a persistent buffer and mirror the errors that
// errorTracker tracks (Vue render errors, axios failures) into the same log.
import { installAppLog, addLogEntry } from './utils/appLog.js';
installAppLog();
trackerOnError((error, context = {}) => {
    const origin = context.vueComponent ? `vue:${context.vueComponent}` : (context.type || 'tracker');
    addLogEntry('error', error, { origin, stack: error?.stack, meta: { type: context.type } });
});

// ── Standalone mode bootstrap ────────────────────────────────────────
// In standalone (capacitor) mode, axios calls are intercepted by a custom
// adapter that routes everything to the local Dexie DB. That adapter is loaded
// by the capacitor entry (main.capacitor.js) via a STATIC import — a dynamic
// import here would create a circular chunk reference (Rollup inlines the
// module into the main bundle and the dynamic import hits the const before
// initialization), breaking app boot. So standalone mode needs no axios
// interception code in this file.
// WEB / HYBRID MODE: standard axios behavior.
// Note: when a server API is configured (apiBaseUrl set), requests go
// directly to the server. Offline fallback for Capacitor+server mode
// is not yet wired here.
if (!(isCapacitor && !apiBaseUrl)) {
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
            // 401 → redirect to login (existing behavior)
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
                return Promise.reject(error);
            }

            // Attach parsed server error info for UI components
            const serverData = error.response?.data
            if (serverData?.error) {
                error.serverErrorType = serverData.error.type
                error.serverError = serverData.error.message
                error.requestId = serverData.error.request_id
                error.serverException = serverData.error.exception
            }

            // Track non-401 errors
            trackError(error)

            // Report 5xx errors to server
            if ((error.response?.status ?? 500) >= 500) {
                reportToServer(error)
            }

            return Promise.reject(error);
        }
    );
}

app.config.globalProperties.$dateFromDb = dateFromDb;

// Flexible dates: localized display + the value object itself
import * as flexibleDate from './utils/flexibleDate.js';
app.config.globalProperties.$flexibleDate = flexibleDate.FlexibleDate;
app.config.globalProperties.$flexibleDateFormat = function(start, end, startMeta, endMeta) {
    return flexibleDate.formatLocalized(start, end, startMeta, endMeta, (key) => i18n.global.t(key));
};
// Compact form for result lists (collapses a same-day time range to one date).
app.config.globalProperties.$flexibleDateFormatShort = function(start, end, startMeta, endMeta) {
    return flexibleDate.formatRangeShort(start, end, startMeta, endMeta, (key) => i18n.global.t(key));
};

// Localized-data resolution helpers (templates can use $objectName(...), etc.)
import * as localized from './utils/localized.js';
app.config.globalProperties.$objectName = localized.objectName;
app.config.globalProperties.$objectDescription = localized.objectDescription;
app.config.globalProperties.$fieldText = localized.fieldText;
app.config.globalProperties.$resolveLocalized = localized.resolveLocalized;
app.config.globalProperties.$hasOtherTranslations = localized.hasOtherTranslations;
app.config.globalProperties.$getClassesList = localized.getClassesList;

(async () => {
    const authStore = useAuthStore();
    await authStore.checkAuth();
    // Fetch public settings (registration status, etc.)
    await authStore.fetchSettings();

    app.mount('#app');

    // Fire-and-forget: warm this user's dropdown lists (link types, things,
    // classes) in the background so the first dropdown of the session opens
    // instantly. Local history is shown immediately; this refresh keeps the
    // local cache in sync with the server without blocking any UI.
    if (authStore.token && authStore.user?.thing_id) {
        useObjectHistoryStore(pinia).preloadFromServer();
    }
})();
