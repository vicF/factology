// resources/js/app.js

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

const app = createApp(App);
app.use(router);
app.use(i18n);
app.use(pinia);

app.config.globalProperties.$truncateText = function(text, length) {
    if (text.length <= length) return text;
    let trimmed = text.substr(0, length);
    return trimmed.substr(0, Math.min(trimmed.length, trimmed.lastIndexOf(" "))) + ' ...';
};

app.config.globalProperties.$navigateToObject = function(id) {
    this.$router.push({ name: 'object', params: { uid: id } });
};

import axios from 'axios';

axios.defaults.withCredentials = true;
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
axios.defaults.baseURL = 'http://localhost:8003';

// ──────────────────────────────────────────────────────────────
//  FIXED 401 INTERCEPTOR – this is the only part that matters now
// ──────────────────────────────────────────────────────────────
axios.interceptors.response.use(
    response => response,
    error => {
        const status = error.response?.status;

        // 401 → redirect to login ONLY if the request was NOT marked as safe
        if (status === 401) {
            // Do NOT redirect when we are just checked who the user is
            if (error.config?.noAuthRedirect) {
                return Promise.reject(error); // just continue, no redirect
            }

            // All other 401s → force login
            if (!router.currentRoute.value.fullPath.includes('/login') &&
                !router.currentRoute.value.fullPath.includes('/register')) {
                const authStore = useAuthStore();
                if (authStore.authenticated) authStore.logout();

                router.push({
                    name: 'login',
                    query: { redirect: router.currentRoute.value.fullPath || '/' }
                });
            }
        }

        return Promise.reject(error);
    }
);

app.config.globalProperties.$dateFromDb = dateFromDb;

app.mount('#app');
