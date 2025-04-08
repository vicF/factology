import './bootstrap';
import '../sass/app.scss';
import Router from '@/router';
import store from '@/store';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { useAuthStore } from './stores/auth';
import { dateFromDb } from './utils/dateUtils.js';
import i18n from './lang/i18n';
const pinia = createPinia();
const app = createApp({});

app.use(pinia);
app.use(Router);
app.use(store);
app.use(i18n);

/**
 * The following block of code may be used to automatically register your
 * Vue components. It will recursively scan this directory for the Vue
 * components and automatically register them with their "basename".
 *
 * Eg. ./components/ExampleComponent.vue -> <example-component></example-component>
 */

// Object.entries(import.meta.glob('./**/*.vue', { eager: true })).forEach(([path, definition]) => {
//     app.component(path.split('/').pop().replace(/\.\w+$/, ''), definition.default);
// });

/**
 * Truncates text
 * @param text
 * @param length
 * @returns {*|string}
 */
app.config.globalProperties.$truncateText = function(text, length) {
    if (text.length <= length) {
        return text;
    }
    let trimmed = text.substr(0, length);
    return trimmed.substr(0, Math.min(trimmed.length, trimmed.lastIndexOf(" "))) + ' ...';
};

/**
 * Router link
 * @param id
 */
app.config.globalProperties.$navigateToObject = function(id) {
    this.$router.push({ name: 'object', params: { uid: id } });
};

import axios from 'axios';

axios.defaults.withCredentials = true;
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
axios.defaults.baseURL = 'http://localhost:8003';

// Add response interceptor
axios.interceptors.response.use(
    response => response, // Pass successful responses through
    error => {
        if (error.response && error.response.status === 419) {
            const authStore = useAuthStore();
            authStore.logout(); // Clear auth state
            router.push({ name: 'login' }); // Redirect to login
            return Promise.reject(new Error('Session expired. Please log in again.'));
        }
        return Promise.reject(error); // Other errors pass through
    }
);

app.config.globalProperties.$dateFromDb = dateFromDb;

/**
 * Finally, we will attach the application instance to a HTML element with
 * an "id" attribute of "app". This element is included with the "auth"
 * scaffolding. Otherwise, you will need to add an element yourself.
 */

app.mount('#app');
