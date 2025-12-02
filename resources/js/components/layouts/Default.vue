<template>
    <div>
        <!-- Main Navbar -->
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
            <div class="container-fluid">
                <span style="color:white" class="me-3">{{ authenticated && user ? user.name : 'guest' }}</span>
                <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
                        data-bs-target="#navbarNavDropdown" aria-controls="navbarNavDropdown" aria-expanded="false"
                        aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse d-flex justify-content-between" id="navbarNavDropdown">
                    <ul class="navbar-nav flex-shrink-0 me-3">
                        <li class="nav-item">
                            <router-link :to="{name:'dashboard'}" class="nav-link">
                                Home <span class="sr-only">(current)</span>
                            </router-link>
                        </li>
                    </ul>

                    <!-- Search form -->
                    <form class="d-flex flex-grow-1 mx-3" @submit.prevent="submitSearch">
                        <input class="form-control me-2" type="search" placeholder="Search"
                               v-model="searchQuery" aria-label="Search">
                        <button class="btn btn-outline-success flex-shrink-0" type="submit">Search</button>
                    </form>

                    <!-- Right side – language switcher & user menu -->
                    <div class="d-flex flex-shrink-0">
                        <LanguageSwitcher/>
                        <ul class="navbar-nav ms-3">
                            <li class="nav-item dropdown">
                                <a class="nav-link dropdown-toggle" href="#" id="navbarDropdownMenuLink"
                                   role="button" data-bs-toggle="dropdown" aria-haspopup="true"
                                   aria-expanded="false">
                                    {{ authenticated && user ? user.name : 'User' }}
                                </a>
                                <div class="dropdown-menu dropdown-menu-end" aria-labelledby="navbarDropdownMenuLink">
                                    <template v-if="authenticated">
                                        <a class="dropdown-item" href="javascript:void(0)" @click="logout">Logout</a>
                                    </template>
                                    <template v-else>
                                        <router-link class="dropdown-item" to="/login">Login</router-link>
                                        <router-link class="dropdown-item" to="/register">Register</router-link>
                                    </template>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Quick create buttons -->
        <nav class="navbar navbar-light bg-light">
            <div class="container-fluid">
                <div class="d-flex gap-2">
                    <button class="btn btn-outline-primary" @click="openCreateModal('Class')">Class</button>
                    <button class="btn btn-outline-primary" @click="openCreateModal('Person')">Person</button>
                    <button class="btn btn-outline-primary" @click="openCreateModal('Event')">Event</button>
                    <button class="btn btn-outline-primary" @click="openCreateModal('Something')">Something</button>
                </div>
            </div>
        </nav>

        <!-- Main content area -->
        <main class="mt-3">
            <div class="container ps-5">
                <div class="row">
                    <div class="col-3 ps-0">
                        <class-tree></class-tree>
                    </div>
                    <div class="col-9">
                        <router-view></router-view>
                    </div>
                </div>
            </div>
        </main>
    </div>
</template>

<script>
// Vue 3 Composition API imports
import { computed, watch, onMounted, ref } from 'vue';
import LanguageSwitcher from "../LanguageSwitcher.vue";
import ClassTree from "../ClassTree.vue";
import { useRouter, useRoute } from 'vue-router';
import { eventBus } from '../../eventBus.js';
import { useAuthStore } from '../../stores/auth';
import axios from 'axios';
import { useSearchStore } from '../../stores/search';

export default {
    name: "default-layout",
    components: { LanguageSwitcher, ClassTree },

    setup() {
        const router = useRouter();
        const route  = useRoute();
        const authStore = useAuthStore();
        const searchStore = useSearchStore();

        /**
         * Verify authentication status.
         * The request uses { noAuthRedirect: true } so a 401 does NOT trigger the global redirect.
         */
        const checkAuth = async () => {
            // Already authenticated → nothing to do
            if (authStore.authenticated) return;

            try {
                await axios.get('/sanctum/csrf-cookie');
                const { data } = await axios.get('/api/user', { noAuthRedirect: true });

                if (data) {
                    authStore.login(data);
                }
            } catch (error) {
                // 401 = guest → expected, stay silent
                if (error.response?.status !== 401) {
                    console.error('Auth check error', error);
                }
            }
        };

        // Two-way binding for the global search query
        const searchQuery = computed({
            get: () => searchStore.searchQuery,
            set: (val) => searchStore.setSearchQuery(val)
        });

        const submitSearch = () => eventBus.emit('trigger-search');

        // --------------------------------------------------------------
        // 1. Run on first load
        // --------------------------------------------------------------
        onMounted(checkAuth);

        // --------------------------------------------------------------
        // 2. Re-check whenever the route changes (including query changes)
        // --------------------------------------------------------------
        watch(() => route.fullPath, checkAuth);

        // --------------------------------------------------------------
        // 3. AFTER login we land on /login?redirect=...
        //     When the user becomes authenticated while we are still on the login page → redirect!
        // --------------------------------------------------------------
        watch(
            () => authStore.authenticated,
            (isAuth) => {
                if (isAuth && route.name === 'login') {
                    const redirect = route.query.redirect || '/';
                    router.replace(redirect);   // replace so the login page is removed from history
                }
            },
            { immediate: true }   // also run once on mount in case the user refreshed the page already logged in
        );

        // Keep search input in sync with URL query param
        watch(() => route.query.q, (q) => {
            searchQuery.value = q || '';
        });

        return {
            authStore,
            route,
            router,
            searchQuery,
            submitSearch,
        };
    },

    computed: {
        eventBus() { return eventBus; },
        user() { return this.authStore.user || null; },
        authenticated() { return this.authStore.authenticated; },
    },

    methods: {
        async logout() {
            try {
                await axios.post('/logout');
                this.authStore.logout();
                this.$router.push({ name: "dashboard" });
            } catch (e) {
                console.error('Logout failed', e);
            }
        },

        openCreateModal(type) {
            // your existing modal logic
        },

        handleObjectCreated(object) {
            console.log('Object created:', object);
            this.$router.push({ path: '/', query: { q: this.searchQuery } });
        }
    }
};
</script>

<style scoped>
.navbar-light .btn { margin-right: 0.5rem; }
.container { max-width: 100%; }
</style>
