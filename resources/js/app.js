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

axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
axios.defaults.baseURL = '/api/v1';
axios.defaults.headers.common['Accept'] = 'application/json';

// Automatically add Authorization header with Bearer token when available
axios.interceptors.request.use(config => {
    const authStore = useAuthStore(pinia);  // pass pinia instance to access store outside setup()
    authStore.restoreAuth();
    if (authStore.token) {
        config.headers.Authorization = `Bearer ${authStore.token}`;
    }
    return config;
});

axios.interceptors.response.use(
    response => response,
    error => {
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

        return Promise.reject(error);
    }
);

app.config.globalProperties.$dateFromDb = dateFromDb;

const authStore = useAuthStore();
await authStore.checkAuth();


app.mount('#app');
