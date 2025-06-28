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
                            <router-link :to="{name:'dashboard'}" class="nav-link">Home <span
                                class="sr-only">(current)</span></router-link>
                        </li>
                    </ul>
                    <form class="d-flex flex-grow-1 mx-3" @submit.prevent="eventBus.emit('trigger-search', { searchQuery })">
                        <input class="form-control me-2" type="search" placeholder="Search" v-model="searchQuery" aria-label="Search">
                        <button class="btn btn-outline-success flex-shrink-0" type="submit">Search</button>
                    </form>
                    <div class="d-flex flex-shrink-0">
                        <LanguageSwitcher/>
                        <ul class="navbar-nav ms-3">
                            <li class="nav-item dropdown">
                                <a class="nav-link dropdown-toggle" href="#" id="navbarDropdownMenuLink"
                                   role="button" data-bs-toggle="dropdown" aria-haspopup="true"
                                   aria-expanded="false">
                                    {{ authenticated && user ? user.name : 'User' }}
                                </a>
                                <div class="dropdown-menu dropdown-menu-end"
                                     aria-labelledby="navbarDropdownMenuLink">
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
        <!-- Rest of the template remains unchanged -->
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
import LanguageSwitcher from "../LanguageSwitcher.vue";
import ClassTree from "../ClassTree.vue";
import { useRouter, useRoute } from 'vue-router';
import { ref, watch, onMounted } from 'vue';
import { eventBus } from '../../eventBus.js';
import { useAuthStore } from '../../stores/auth';
import {useCheckboxStore} from '../../stores/checkboxes';
import axios from 'axios';

export default {
    name: "default-layout",
    components: { LanguageSwitcher, ClassTree },
    setup() {
        const router = useRouter();
        const route = useRoute();
        const authStore = useAuthStore();
        const searchQuery = ref(route.query.q || '');
        const showModal = ref(false);
        const selectedType = ref('');
        const checkboxStore = useCheckboxStore();

        const checkAuth = async () => {
            try {
                await axios.get('/sanctum/csrf-cookie');
                const response = await axios.get('/api/user');
                if (response.data && !authStore.authenticated) {
                    authStore.login(response.data);
                }
                console.log('Authenticated:', authStore.authenticated);
                console.log('User:', authStore.user);
            } catch (error) {
                if (error.response?.status === 401) {
                    console.log('Not authenticated yet (401)');
                } else {
                    console.error('Auth check failed:', error.response?.status);
                }
                if (authStore.authenticated) {
                    authStore.logout(); // Clear stale state
                }
            }
        };

// Define handleSearch within setup
        /*const handleSearch = async (classIds = []) => {
            const selectedClassIds = classIds.length > 0 ? classIds : checkboxStore.checkedItems;
            const queryParams = {};

            if (searchQuery.value.trim()) {
                queryParams.q = searchQuery.value.trim();
            }

            if (selectedClassIds.length > 0) {
                queryParams.classIds = selectedClassIds.join(',');
            }

            try {
                await router.push({
                    path: '/',
                    query: queryParams,
                });

                const response = await axios.get('/api/search', {
                    params: queryParams,
                });

                console.log('Search results:', response.data);
                eventBus.emit('search-results', response.data);
            } catch (error) {
                console.error('Search failed:', error);
            }
        };*/

        onMounted(() => {
            checkAuth();
// Use the handleSearch function defined in setup
            /* eventBus.on('trigger-search', (classIds) => {
                handleSearch(classIds);
            });*/
        });

        watch(() => route.path, () => {
            checkAuth();
        });

        watch(() => route.query.q, (newQuery) => {
            searchQuery.value = newQuery || '';
        });

        return {
            router,
            route,
            searchQuery,
            showModal,
            selectedType,
            authStore,
            checkAuth,
            // handleSearch, // Return handleSearch so it’s available in the template
        };
    },
    computed: {
        eventBus() {
            return eventBus
        },
        user() {
            return this.authStore.user || null;
        },
        authenticated() {
            return this.authStore.authenticated;
        },
    },
    methods: {
        async logout() {
            await axios.post('/logout').then(() => {
                this.authStore.logout();
                this.$router.push({name: "dashboard"});
            }).catch(error => {
                console.error('Logout failed:', error);
            });
        },
        openCreateModal(type) {
            this.selectedType = type;
            this.showModal = true;
        },
        closeModal() {
            this.showModal = false;
            this.selectedType = '';
        },
        handleObjectCreated(object) {
            console.log('Object created:', object);
            this.$router.push({path: '/', query: {q: this.searchQuery}});
        },
    },
};
</script>

<style scoped>
.navbar-light .btn {
    margin-right: 0.5rem;
}

.container {
    max-width: 100%;
}
</style>
