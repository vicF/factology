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
                            <router-link :to="{name:'dashboard'}" class="nav-link">Home</router-link>
                        </li>
                    </ul>
                    <form class="d-flex flex-grow-1 mx-3" @submit.prevent="submitSearch">
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
                                        <router-link class="dropdown-item" to="/login">Log in</router-link>
                                        <router-link class="dropdown-item" to="/register">Register</router-link>
                                    </template>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Main content area -->
        <main class="mt-3">
            <!-- Mobile: Swiper Carousel -->
            <div v-if="isMobile" class="swiper-container" ref="swiperContainer">
                <div class="swiper-wrapper">
                    <!-- Screen 1: Tree -->
                    <div class="swiper-slide">
                        <div class="slide-content">
                            <class-tree></class-tree>
                        </div>
                    </div>

                    <!-- Screen 2: Main content (router-view) -->
                    <div class="swiper-slide">
                        <div class="slide-content">
                            <router-view></router-view>
                        </div>
                    </div>
                </div>

                <!-- Pagination dots -->
                <div class="swiper-pagination"></div>
            </div>

            <!-- Desktop: Traditional grid layout -->
            <div v-else class="container ps-5">
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

<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Swiper from 'swiper'
import { Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'

import LanguageSwitcher from "../LanguageSwitcher.vue"
import ClassTree from "../ClassTree.vue"

import { eventBus } from '../../eventBus.js'
import { useAuthStore } from '../../stores/auth'
import { useSearchStore } from '../../stores/search'
import axios from 'axios'

// Provide getThumbUrl function for child components
const getThumbUrl = (thing_id) => {
    if (!thing_id) return '';
    return `/thumbs/${thing_id.charAt(0)}/${thing_id.charAt(1)}/${thing_id}.jpg`;
};
provide('getThumbUrl', getThumbUrl);

const router = useRouter()
const route = useRoute()

const authStore = useAuthStore()
const searchStore = useSearchStore()

const showModal = ref(false)
const selectedType = ref('')
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 768)
const swiperContainer = ref(null)
let swiperInstance = null

// Check if mobile
const isMobile = computed(() => windowWidth.value < 768)

// Handle window resize
const handleResize = () => {
    windowWidth.value = window.innerWidth
}

// Initialize Swiper for mobile
const initSwiper = () => {
    if (isMobile.value && swiperContainer.value && !swiperInstance) {
        swiperInstance = new Swiper(swiperContainer.value, {
            modules: [Pagination],
            slidesPerView: 1,
            spaceBetween: 0,
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
                dynamicBullets: true,
            },
            // Enhanced touch settings for better UX
            touchStartPreventDefault: false,
            simulateTouch: true,
            threshold: 30, // Requires 30px drag before sliding
            touchRatio: 0.8,
            touchAngle: 45, // Max angle for horizontal swipe
            resistance: true,
            resistanceRatio: 0.85,
            speed: 400,
            followFinger: true,
            freeMode: false,
            shortSwipes: true,
            longSwipes: false,
            touchMoveStopPropagation: true,
        })
    } else if (!isMobile.value && swiperInstance) {
        // Destroy Swiper when switching to desktop
        swiperInstance.destroy(true, true)
        swiperInstance = null
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
    window.addEventListener('resize', handleResize)

    // Initialize Swiper after DOM is ready
    nextTick(() => {
        initSwiper()
    })
})

// Watch for route changes
watch(() => route.path, () => {
    checkAuth()
})

watch(() => route.query.q, (newQuery) => {
    searchQuery.value = newQuery || ''
})

// Re-initialize Swiper when switching between mobile/desktop
watch(isMobile, () => {
    if (swiperInstance) {
        swiperInstance.destroy(true, true)
        swiperInstance = null
    }
    nextTick(() => {
        initSwiper()
    })
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

// ---------------------------------------------------------------------------

const logout = async () => {
    try {
        await authStore.logout();
        router.push('/');
    } catch (error) {
        if (error.response?.status === 401) {
            console.log('Already logged out');
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

onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
    if (swiperInstance) {
        swiperInstance.destroy(true, true)
    }
})
</script>

<style scoped>
.navbar-light .btn {
    margin-right: 0.5rem;
}

.container {
    max-width: 100%;
}

/* Swiper styles for mobile */
.swiper-container {
    width: 100%;
    height: calc(100vh - 70px);
    overflow: hidden;
}

.swiper-slide {
    overflow-y: auto;
    padding: 16px;
    -webkit-overflow-scrolling: touch;
}

.slide-content {
    height: 100%;
}

/* Pagination dots styling */
:deep(.swiper-pagination) {
    position: fixed;
    bottom: 10px;
    left: 0;
    right: 0;
    z-index: 10;
}

:deep(.swiper-pagination-bullet) {
    background: #6c757d;
    opacity: 0.5;
    width: 8px;
    height: 8px;
    margin: 0 6px;
}

:deep(.swiper-pagination-bullet-active) {
    background: #0d6efd;
    opacity: 1;
}

/* Hide pagination on desktop */
@media (min-width: 768px) {
    :deep(.swiper-pagination) {
        display: none;
    }
}
</style>
