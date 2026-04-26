<template>
    <div>
        <!-- Main Navbar -->
        <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
            <div class="container-fluid">
                <!-- Mobile: Button to open tree drawer -->
                <button class="btn btn-outline-light d-md-none me-2" type="button" data-bs-toggle="offcanvas"
                        data-bs-target="#treeOffcanvas" aria-controls="treeOffcanvas">
                    ☰ Browse
                </button>

<!--                <span style="color:white" class="me-3">{{ authenticated && user ? user.name : 'guest' }}</span>-->

                <div class="collapse navbar-collapse d-flex justify-content-between" id="navbarNavDropdown">
                    <ul class="navbar-nav flex-shrink-0 me-3">
                        <li class="nav-item">
                            <router-link :to="{name:'dashboard'}" class="nav-link" title="Home"><svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="24"
                                height="24"
                                viewBox="0 -960 960 960"
                                fill="#e3e3e3"
                            >
                                <path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Zm320-350Z"/>
                            </svg></router-link>
                        </li>
                    </ul>
                    <form class="d-flex flex-grow-1 mx-3" @submit.prevent="submitSearch">
                        <input class="form-control me-2" type="search" placeholder="Search" v-model="searchQuery"
                               aria-label="Search">
                        <button class="btn btn-outline-success flex-shrink-0" type="submit">Search</button>
                    </form>
                    <div class="d-flex flex-shrink-0">
                        <LanguageSwitcher/>
                        <ul class="navbar-nav ms-3">
                            <li class="nav-item dropdown">
                                <a
                                    class="nav-link dropdown-toggle d-flex align-items-center"
                                    href="#"
                                    id="navbarDropdownMenuLink"
                                    role="button"
                                    data-bs-toggle="dropdown"
                                    aria-haspopup="true"
                                    aria-expanded="false"
                                >
                                    <!-- Not authenticated: show login icon -->
                                    <svg
                                        v-if="!authenticated || !user"
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="24"
                                        height="24"
                                        viewBox="0 -960 960 960"
                                        fill="currentColor"
                                        class="me-1"
                                        role="img"
                                        aria-label="Login"
                                    >
                                        <path d="M480-120v-80h280v-560H480v-80h280q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H480Zm-80-160-56-56 103-104H120v-80h327L344-624l56-56 200 200-200 200Z"/>
                                    </svg>

                                    <!-- Authenticated: show username -->
                                    <span v-else class="fw-semibold">
      {{ user.name }}
    </span>
                                </a>

                                <!-- Dropdown menu -->
                                <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="navbarDropdownMenuLink">
                                    <!-- Guest links -->
                                    <template v-if="!authenticated">
                                        <li><router-link class="dropdown-item" to="/login">Login</router-link></li>
                                        <li><router-link class="dropdown-item" to="/register">Register</router-link></li>
                                    </template>

                                    <!-- User links -->
                                    <template v-else>
                                        <li><router-link class="dropdown-item" to="/profile">Profile</router-link></li>
                                        <li><hr class="dropdown-divider" /></li>
                                        <li><a class="dropdown-item" href="#" @click.prevent="logout">Logout</a></li>
                                    </template>
                                </ul>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Main content area -->
        <main class="mt-3">
            <div class="container px-3 px-md-5">
                <div class="row">
                    <!-- Desktop: persistent tree column -->
                    <div class="col-3 ps-0 d-none d-md-block">
                        <class-tree></class-tree>
                    </div>

                    <!-- Content column: full width on mobile, 9 cols on desktop -->
                    <div class="col-12 col-md-9">
                        <router-view></router-view>
                    </div>
                </div>
            </div>
        </main>

        <!-- Mobile: Offcanvas drawer for tree (slides from left) -->
        <div class="offcanvas offcanvas-start" tabindex="-1" id="treeOffcanvas" aria-labelledby="treeOffcanvasLabel">
            <div class="offcanvas-header">
                <h5 id="treeOffcanvasLabel">Classification Tree</h5>
                <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>
            <div class="offcanvas-body">
                <class-tree></class-tree>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

import LanguageSwitcher from "../LanguageSwitcher.vue"
import ClassTree from "../ClassTree.vue"

import { eventBus } from '../../eventBus.js'
import { useAuthStore } from '../../stores/auth'
import { useSearchStore } from '../../stores/search'
import axios from 'axios'
import { provide } from 'vue';

// Маленькая функция для получения URL картинки
const getThumbUrl = (thing_id) => {
    if (!thing_id) return '';
    return `/thumbs/${thing_id.charAt(0)}/${thing_id.charAt(1)}/${thing_id}.jpg`;
};

// Делаем функцию доступной для всех дочерних компонентов
provide('getThumbUrl', getThumbUrl);

const router = useRouter()
const route = useRoute()

const authStore = useAuthStore()
const searchStore = useSearchStore()

const showModal = ref(false)
const selectedType = ref('')

// ---------------------------------------------------------------------------
// Helper: close the mobile offcanvas drawer if open
const closeMobileTreeDrawer = () => {
    // Check if Bootstrap is available and try to hide the offcanvas
    if (typeof bootstrap !== 'undefined') {
        const offcanvasElement = document.getElementById('treeOffcanvas')
        if (offcanvasElement) {
            const offcanvasInstance = bootstrap.Offcanvas.getInstance(offcanvasElement)
            if (offcanvasInstance) {
                offcanvasInstance.hide()
            }
        }
    } else {
        // Fallback: try to find and click the close button
        const closeButton = document.querySelector('#treeOffcanvas .btn-close')
        if (closeButton) {
            closeButton.click()
        }
    }
}

// ---------------------------------------------------------------------------

const checkAuth = async () => {
    try {
        const response = await axios.get('user', { noAuthRedirect: true })
        if (response.data && !authStore.authenticated) {
            authStore.login(response.data)
        }
        console.log('Authenticated:', authStore.authenticated)
        console.log('User:', authStore.user)
    } catch (error) {
        if (error.response?.status === 401) {
            console.log('Not authenticated yet (401)')
        } else {
            console.error('Auth check failed:', error.response?.status)
        }
        if (authStore.authenticated) {
            authStore.logout()
        }
    }
}

const searchQuery = computed({
    get() {
        return searchStore.searchQuery
    },
    set(value) {
        console.log('default.vue - Updating searchQuery:', value)
        searchStore.setSearchQuery(value)
    }
})

const submitSearch = () => {
    console.log('default.vue - Emitting trigger-search')
    eventBus.emit('trigger-search')
}

// ---------------------------------------------------------------------------

onMounted(() => {
    checkAuth()

    // Initialize Bootstrap offcanvas (just to ensure event handlers are bound)
    // Bootstrap will auto-initialize elements with data-bs-toggle="offcanvas"
    // No extra code needed, but we close drawer on route changes (see watcher below)
})

// Watch for route changes to automatically close the mobile drawer when navigating
watch(() => route.path, () => {
    checkAuth()
    closeMobileTreeDrawer()
})

watch(() => route.query.q, (newQuery) => {
    searchQuery.value = newQuery || ''
})

watch(
    () => authStore.authenticated,
    (isAuthenticated) => {
        if (isAuthenticated && route.matched.some(r => r.components?.default?.name === 'login')) {
            const redirect = route.query.redirect || '/'
            console.debug('router.replace(' + redirect + ')')
            router.replace(redirect)
        }
    },
    { immediate: true }
)

// ---------------------------------------------------------------------------

const user = computed(() => authStore.user || null)
const authenticated = computed(() => authStore.authenticated)

// Note: eventBus is used directly — no need for computed wrapper anymore

// ---------------------------------------------------------------------------

const logout = async () => {
    try {
        await authStore.logout();
        router.push('/');
    } catch (error) {
        // If it's a 401, the user is already logged out - this is fine
        if (error.response?.status === 401) {
            console.log('Already logged out');
            // Still clear local state and redirect
            authStore.clearAuth();
            router.push('/');
        } else {
            console.error('Logout failed:', error);
        }
    }
};

const openCreateModal = (type) => {
    selectedType.value = type
    showModal.value = true
}

const closeModal = () => {
    showModal.value = false
    selectedType.value = ''
}

const handleObjectCreated = (object) => {
    console.log('Object created:', object)
    router.push({ path: '/', query: { q: searchQuery.value } })
}

// Clean up any potential global listeners if needed
onUnmounted(() => {
    // No specific cleanup required for offcanvas
})
</script>

<style scoped>
.navbar-light .btn {
    margin-right: 0.5rem;
}

.container {
    max-width: 100%;
}

/* Optional: adjust offcanvas width for better mobile experience */
@media (max-width: 576px) {
    .offcanvas {
        width: 85% !important;
    }
}

/* Ensure the offcanvas drawer has a proper z-index if needed */
.offcanvas {
    z-index: 1050;
}
</style>
