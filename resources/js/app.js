/**
 * First we will load all of this project's JavaScript dependencies which
 * includes Vue and other libraries. It is a great starting point when
 * building robust, powerful web applications using Vue and Laravel.
 */

import './bootstrap';
import '../sass/app.scss';
import Router from '@/router';
import store from '@/store';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { useAuthStore } from './stores/auth';
import { dateFromDb } from './utils/dateUtils.js';
import i18n from './lang/i18n';

/**
 * Next, we will create a fresh Vue application instance. You may then begin
 * registering components with the application instance so they are ready
 * to use in your application's views. An example is included for you.
 */
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



// Response interceptor for 401 and 419
axios.interceptors.response.use(
    response => response,
    error => {
        const status = error.response?.status;
        if (status === 401 || status === 419) {
            const authStore = useAuthStore();
            authStore.logout(); // Clear auth state
            Router.push({ name: 'login' }); // Redirect to login
            return Promise.reject(new Error('Session expired or unauthorized. Please log in.'));
        }
        return Promise.reject(error); // Pass other errors to component
    }
);

app.config.globalProperties.$dateFromDb = dateFromDb;

/**
 * Finally, we will attach the application instance to a HTML element with
 * an "id" attribute of "app". This element is included with the "auth"
 * scaffolding. Otherwise, you will need to add an element yourself.
 */

app.mount('#app');
