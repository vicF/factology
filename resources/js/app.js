import './bootstrap';
import '../sass/app.scss';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { useAuthStore } from './stores/auth';
import { dateFromDb } from './utils/dateUtils.js';
const pinia = createPinia();

import App from './components/App.vue';
import router from './router'; // Adjust if router is defined elsewhere
import i18n from './lang/i18n';



const app = createApp(App);
app.use(router);
app.use(i18n);
app.use(pinia);

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

// Response interceptor for 401 and 419
axios.interceptors.response.use(
    response => response, // Pass successful responses through
    error => {
        const status = error.response?.status;
        if (status === 401 && !router.currentRoute.value.fullPath.includes('/login')) {
            const authStore = useAuthStore();
            if (!authStore.authenticated) {
                // Redirect to login with current route as redirect query
                router.push({
                    name: 'login',
                    query: { redirect: router.currentRoute.value.fullPath }
                });
            } else {
                // Authenticated but unauthorized
                //router.push({ name: '/' });
            }
        } else if (status === 400 && error.message.includes('header')) {
            const authStore = useAuthStore();
            authStore.logout();
            router.push({ name: 'dashboard' });
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
