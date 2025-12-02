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

axios.defaults.withCredentials = true;
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
axios.defaults.baseURL = 'http://localhost:8003';

// FINAL WORKING INTERCEPTOR — ONLY CHANGE NEEDED
axios.interceptors.response.use(
    response => response,
    error => {
        const status = error.response?.status;
        const currentPath = router.currentRoute.value.fullPath;

        if (status === 401) {
            // NEVER call logout() if user is not logged in
            const authStore = useAuthStore();
            if (authStore.authenticated) {
                authStore.logout?.(); // only if actually logged in
            }

            // Only redirect if not already on login/register
            if (!currentPath.includes('/login') && !currentPath.includes('/register')) {
                router.push({
                    name: 'login',
                    query: { redirect: currentPath }
                });
            }
        }

        return Promise.reject(error);
    }
);

app.config.globalProperties.$dateFromDb = dateFromDb;

app.mount('#app');
