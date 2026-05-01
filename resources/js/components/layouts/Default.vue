<template>
    <div class="app-container">
        <!-- Main Navbar -->
        <nav class="navbar navbar-expand-lg navbar-dark" style="background-color: #0d6efd;">
            <div class="container-fluid">
                <div class="collapse navbar-collapse d-flex justify-content-between" id="navbarNavDropdown">
                    <ul class="navbar-nav flex-shrink-0 me-2">
                        <li class="nav-item">
                            <router-link :to="{name:'dashboard'}" class="nav-link" title="Home">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="24"
                                    height="24"
                                    viewBox="0 -960 960 960"
                                    fill="#ffffff"
                                >
                                    <path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Zm320-350Z"/>
                                </svg>
                            </router-link>
                        </li>
                    </ul>
                    <form class="d-flex flex-grow-1 mx-2" @submit.prevent="submitSearch">
                        <input class="form-control me-2" type="search" placeholder="Search" v-model="searchQuery" aria-label="Search">
                        <button class="btn btn-outline-light flex-shrink-0 search-btn" type="submit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 -960 960 960" fill="white">
                                <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
                            </svg>
                        </button>
                    </form>
                    <div class="d-flex flex-shrink-0 align-items-center">
                        <!-- Compact Language Switcher with Text Only -->
                        <div class="language-switcher me-2">
                            <button
                                class="btn btn-link nav-link p-1 dropdown-toggle"
                                type="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                                style="color: white; text-decoration: none; font-weight: 500; font-size: 14px;"
                            >
                                {{ currentLocale.toUpperCase() }}
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li v-for="locale in availableLocales" :key="locale.code">
                                    <a
                                        class="dropdown-item"
                                        href="#"
                                        :class="{ active: currentLocale === locale.code }"
                                        @click.prevent="switchLanguage(locale.code)"
                                    >
                                        {{ locale.name }}
                                    </a>
                                </li>
                            </ul>
                        </div>

                        <!-- User Dropdown - Fixed for mobile -->
                        <div class="user-dropdown ms-2">
                            <button
                                class="btn btn-link nav-link dropdown-toggle d-flex align-items-center"
                                type="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                                style="color: white; text-decoration: none; padding: 0.5rem 0;"
                            >
                                <!-- Not authenticated: show login icon -->
                                <svg
                                    v-if="!authenticated || !user"
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="20"
                                    height="20"
                                    viewBox="0 -960 960 960"
                                    fill="white"
                                    class="me-1"
                                >
                                    <path d="M480-120v-80h280v-560H480v-80h280q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H480Zm-80-160-56-56 103-104H120v-80h327L344-624l56-56 200 200-200 200Z"/>
                                </svg>

                                <!-- Authenticated: show username -->
                                <span v-else class="fw-semibold" style="font-size: 14px;">
                                    {{ user.name }}
                                </span>
                            </button>

                            <ul class="dropdown-menu dropdown-menu-end">
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
                        </div>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Main content area -->
        <main class="mt-3">
            <!-- Mobile: Custom Swipe Implementation -->
            <div v-if="isMobile" class="mobile-view">
                <div
                    class="swipe-container"
                    ref="swipeContainer"
                    @touchstart="onTouchStart"
                    @touchmove="onTouchMove"
                    @touchend="onTouchEnd"
                >
                    <div class="swipe-track" :style="{ transform: `translateX(${currentOffset}px)`, transition: isTransitioning ? 'transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)' : 'none' }">
                        <!-- Screen 1: Tree -->
                        <div class="swipe-screen">
                            <div class="screen-content" ref="screen1Content">
                                <class-tree></class-tree>
                            </div>
                        </div>

                        <!-- Screen 2: Main content -->
                        <div class="swipe-screen">
                            <div class="screen-content" ref="screen2Content">
                                <router-view></router-view>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Pagination dots -->
                <div class="pagination-dots">
                    <div
                        v-for="index in 2"
                        :key="index"
                        class="dot"
                        :class="{ active: currentScreen === index - 1 }"
                        @click="goToScreen(index - 1)"
                    ></div>
                </div>
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
import { computed, ref, watch, onMounted, onUnmounted, provide, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'

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

const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 768)
const swipeContainer = ref(null)
const screen1Content = ref(null)
const screen2Content = ref(null)
const currentScreen = ref(1) // Start on main content (right screen)
const startX = ref(0)
const startY = ref(0)
const currentOffset = ref(0)
const isTransitioning = ref(false)
const screenWidth = ref(0)
const isDragging = ref(false)
const dragDirection = ref(null) // 'horizontal' or 'vertical'

// Language switcher data
const currentLocale = ref('en')
const availableLocales = [
    { code: 'en', name: 'English' },
    { code: 'ru', name: 'Русский' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'es', name: 'Español' }
]

const switchLanguage = (locale) => {
    currentLocale.value = locale
    console.log('Language switched to:', locale)
}

// Check if mobile
const isMobile = computed(() => windowWidth.value < 768)

// Handle window resize
const handleResize = () => {
    windowWidth.value = window.innerWidth
    if (isMobile.value) {
        updateScreenWidth()
        goToScreen(currentScreen.value, true)
    }
}

const updateScreenWidth = () => {
    if (swipeContainer.value) {
        screenWidth.value = swipeContainer.value.clientWidth
        // Update offset after width change
        currentOffset.value = -currentScreen.value * screenWidth.value
    }
}

const goToScreen = (index, instant = false) => {
    if (index < 0 || index > 1) return
    currentScreen.value = index
    isTransitioning.value = !instant
    currentOffset.value = -index * screenWidth.value

    setTimeout(() => {
        isTransitioning.value = false
    }, 300)
}

const onTouchStart = (e) => {
    startX.value = e.touches[0].clientX
    startY.value = e.touches[0].clientY
    isDragging.value = true
    dragDirection.value = null
    isTransitioning.value = false
}

const onTouchMove = (e) => {
    if (!isDragging.value) return

    const deltaX = e.touches[0].clientX - startX.value
    const deltaY = e.touches[0].clientY - startY.value

    // Determine scroll direction after minimal movement
    if (!dragDirection.value && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
        dragDirection.value = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
    }

    // If vertical scroll, let the browser handle it naturally
    if (dragDirection.value === 'vertical') {
        return // Allow native vertical scrolling
    }

    // Horizontal swipe logic
    if (dragDirection.value === 'horizontal') {
        e.preventDefault()

        const newOffset = -currentScreen.value * screenWidth.value + deltaX

        // Add resistance at edges
        if ((currentScreen.value === 0 && deltaX > 0) || (currentScreen.value === 1 && deltaX < 0)) {
            currentOffset.value = -currentScreen.value * screenWidth.value + deltaX * 0.3
        } else {
            currentOffset.value = newOffset
        }
    }
}

const onTouchEnd = (e) => {
    if (!isDragging.value) {
        isDragging.value = false
        return
    }

    // If vertical scroll, just reset and exit
    if (dragDirection.value === 'vertical') {
        isDragging.value = false
        dragDirection.value = null
        startX.value = 0
        startY.value = 0
        return
    }

    // Horizontal swipe logic
    if (dragDirection.value === 'horizontal') {
        const deltaX = e.changedTouches[0].clientX - startX.value
        const threshold = screenWidth.value * 0.2

        if (Math.abs(deltaX) > threshold) {
            if (deltaX < 0 && currentScreen.value < 1) {
                goToScreen(currentScreen.value + 1)
            } else if (deltaX > 0 && currentScreen.value > 0) {
                goToScreen(currentScreen.value - 1)
            } else {
                goToScreen(currentScreen.value)
            }
        } else {
            goToScreen(currentScreen.value)
        }
    }

    isDragging.value = false
    dragDirection.value = null
    startX.value = 0
    startY.value = 0
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

    if (isMobile.value) {
        nextTick(() => {
            updateScreenWidth()
            // Start on screen 1 (main content) by default
            goToScreen(1, true)
        })
    }
})

// Watch for route changes
watch(() => route.path, () => {
    checkAuth()
    // Keep current screen or reset to main content based on route
    if (isMobile.value) {
        // If we're on a detail page, stay on main content screen
        if (currentScreen.value !== 1) {
            goToScreen(1)
        }
    }
})

watch(() => route.query.q, (newQuery) => {
    searchQuery.value = newQuery || ''
})

// Update screen width when route changes (content might change height)
watch(() => route.path, () => {
    if (isMobile.value) {
        setTimeout(updateScreenWidth, 100)
    }
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

// Watch for window width changes to reinitialize swiping
watch(isMobile, (newVal) => {
    if (newVal) {
        nextTick(() => {
            updateScreenWidth()
            goToScreen(currentScreen.value, true)
        })
    }
})

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

onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.navbar-light .btn {
    margin-right: 0.5rem;
}

.container {
    max-width: 100%;
}

/* Language switcher styles */
.language-switcher {
    position: relative;
}

.language-switcher .dropdown-toggle::after {
    margin-left: 4px;
    vertical-align: middle;
}

/* Search button hover fix - keep icon visible */
.search-btn:hover svg {
    fill: #0d6efd;
}

.search-btn:hover {
    background-color: white;
    border-color: white;
}

/* User dropdown styles */
.user-dropdown {
    position: relative;
}

.user-dropdown .dropdown-toggle::after {
    margin-left: 4px;
    vertical-align: middle;
}

/* Fix for mobile dropdowns */
@media (max-width: 768px) {
    .dropdown-menu {
        position: absolute !important;
        right: 0 !important;
        left: auto !important;
        min-width: 160px !important;
    }

    .user-dropdown .dropdown-menu,
    .language-switcher .dropdown-menu {
        right: 0 !important;
        left: auto !important;
        top: 100% !important;
        transform: none !important;
    }
}

.language-switcher .dropdown-item.active {
    background-color: #0d6efd;
    color: white;
}

.language-switcher .dropdown-item:active {
    background-color: #0d6efd;
}

.user-dropdown .dropdown-item.active {
    background-color: #0d6efd;
    color: white;
}

.user-dropdown .dropdown-item:active {
    background-color: #0d6efd;
}

/* Reduced spacing between Home icon and search */
.navbar-nav.me-2 {
    margin-right: 0.5rem !important;
}

form.mx-2 {
    margin-left: 0.5rem !important;
    margin-right: 0.5rem !important;
}

/* Mobile view - custom swipe implementation */
.mobile-view {
    position: relative;
    width: 100%;
    overflow: hidden;
}

.swipe-container {
    width: 100%;
    overflow: hidden;
    touch-action: pan-y pinch-zoom;
}

.swipe-track {
    display: flex;
    flex-direction: row;
    width: 200%;
    height: calc(100vh - 70px);
    will-change: transform;
}

.swipe-screen {
    flex: 0 0 50%;
    width: 50%;
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
}

.screen-content {
    width: 100%;
    height: 100%;
    padding: 16px;
    box-sizing: border-box;
}

/* Pagination dots */
.pagination-dots {
    position: fixed;
    bottom: 10px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 8px;
    z-index: 10;
    padding: 8px;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #6c757d;
    opacity: 0.5;
    cursor: pointer;
    transition: all 0.2s ease;
}

.dot.active {
    width: 20px;
    border-radius: 4px;
    background-color: #0d6efd;
    opacity: 1;
}

/* Hide pagination on desktop */
@media (min-width: 768px) {
    .pagination-dots {
        display: none;
    }
}

/* Ensure no overflow on mobile */
@media (max-width: 767px) {
    body, html {
        overflow-x: hidden;
        position: relative;
        width: 100%;
    }

    .app-container {
        overflow-x: hidden;
        width: 100%;
    }
}
</style>
