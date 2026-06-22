<template>
    <div class="app-container">
        <!-- Main Navbar -->
        <nav class="navbar navbar-expand-lg navbar-dark" style="background-color: #0d6efd;">
            <div class="container-fluid">
                <div class="collapse navbar-collapse d-flex justify-content-between align-items-center" id="navbarNavDropdown">
                    <ul class="navbar-nav flex-shrink-0 me-2">
                        <li class="nav-item">
                            <router-link :to="{name:'dashboard'}" class="nav-link" title="Home" data-testid="home-link" style="display: flex; align-items: center; padding: 0.5rem 0;">
                                <IconHome class="icon-xl" />
                            </router-link>
                        </li>
                    </ul>

                    <form class="d-flex flex-grow-1 mx-2" @submit.prevent="submitSearch" data-testid="search-form" v-if="!authStore.hidePublicContent">
                        <input class="form-control me-2" type="search" placeholder="Search" v-model="searchQuery" aria-label="Search" data-testid="search-input">
                        <button class="btn btn-outline-light flex-shrink-0 search-btn" type="submit" data-testid="search-button" style="display: flex; align-items: center; justify-content: center;">
                            <IconSearch class="icon-md" />
                        </button>
                    </form>

                    <div class="d-flex flex-shrink-0 align-items-center" style="gap: 0.5rem;">
                        <!-- Compact Language Switcher -->
                        <div class="language-switcher" data-testid="language-switcher">
                            <button
                                class="btn btn-link nav-link dropdown-toggle d-flex align-items-center"
                                type="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                                data-testid="language-dropdown-btn"
                                style="color: white; text-decoration: none; font-weight: 500; font-size: 14px; padding: 0.5rem 0;"
                            >
                                {{ (currentLocale || 'en').toUpperCase() }}
                            </button>
                            <ul class="dropdown-menu dropdown-menu-end">
                                <li v-for="locale in availableLocales" :key="locale.code">
                                    <a
                                        class="dropdown-item"
                                        href="#"
                                        :class="{ active: currentLocale === locale.code }"
                                        @click.prevent="switchLanguage(locale.code)"
                                        :data-testid="`lang-${locale.code}`"
                                    >
                                        {{ locale.name }}
                                    </a>
                                </li>
                            </ul>
                        </div>

                        <!-- User Dropdown -->
                        <div class="user-dropdown" data-testid="user-dropdown">
                            <button
                                class="btn btn-link nav-link dropdown-toggle d-flex align-items-center"
                                type="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                                data-testid="user-dropdown-btn"
                                style="color: white; text-decoration: none; padding: 0.5rem 0;"
                                :title="authenticated && user ? `Logged in as ${user.name}` : 'Not logged in'"
                            >
                                <div class="user-icon-container">
                                    <IconUser class="icon-lg" />
                                    <div v-if="authenticated && user" class="status-indicator logged-in" data-testid="logged-in-indicator">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 -960 960 960" fill="white">
                                            <path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/>
                                        </svg>
                                    </div>
                                    <div v-else class="status-indicator logged-out" data-testid="logged-out-indicator">
                                        <IconUser class="icon-xs" />
                                    </div>
                                </div>
                            </button>

                            <ul class="dropdown-menu dropdown-menu-end" data-testid="user-dropdown-menu">
                                <!-- Guest links -->
                                <template v-if="!authenticated">
                                    <li class="dropdown-header text-muted small">Guest Mode</li>
                                    <li><router-link class="dropdown-item" to="/login" data-testid="login-link">
                                        <IconLogin class="icon-sm me-2" />
                                        Login
                                    </router-link></li>
                                    <li v-if="authStore.registrationEnabled"><router-link class="dropdown-item" to="/register" data-testid="register-link">
                                        <IconAdd class="icon-sm me-2" />
                                        Register
                                    </router-link></li>
                                </template>

                                <!-- User links -->
                                <template v-else>
                                    <li class="dropdown-header text-muted small">
                                        <IconCheck class="icon-xs me-1" />
                                        Logged in as
                                    </li>
                                    <li><router-link class="dropdown-item fw-semibold" :to="`/object/${user.thing_id}`" data-testid="profile-link">
                                        <IconUser class="icon-sm me-2" />
                                        {{ user.name }}
                                    </router-link></li>
                                    <li><hr class="dropdown-divider" /></li>
                                    <li><a class="dropdown-item" href="#" @click.prevent="logout" data-testid="logout-link">
                                        <IconLogout class="icon-sm me-2" />
                                        Logout
                                    </a></li>
                                </template>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Main content area -->
        <main class="mt-3">
            <!-- Mobile: content only (no tree/swipe) when public content is hidden -->
            <div v-if="isMobile && authStore.hidePublicContent" data-testid="mobile-content-only">
                <router-view></router-view>
            </div>

            <!-- Mobile: Custom Swipe Implementation -->
            <div v-else-if="isMobile" class="mobile-view" data-testid="mobile-view">
                <!-- Pull-to-refresh indicator -->
                <div
                    class="pull-refresh-indicator"
                    :class="{ visible: pullDistance > 5 || isRefreshing }"
                >
                    <div class="pull-refresh-content" :style="{ opacity: pullDistance > 10 ? 1 : 0 }">
                        <svg v-if="isRefreshing" class="pull-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-linecap="round"/>
                        </svg>
                        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                            :style="{ transform: pullDistance >= 80 ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }">
                            <path d="M12 5v14M5 12l7-7 7 7"/>
                        </svg>
                        <span class="pull-refresh-text">
                            {{ isRefreshing ? 'Refreshing...' : pullDistance >= 80 ? 'Release to refresh' : 'Pull to refresh' }}
                        </span>
                    </div>
                </div>

                <div
                    class="swipe-container"
                    ref="swipeContainer"
                    @touchstart="onTouchStart"
                    @touchmove="onTouchMove"
                    @touchend="onTouchEnd"
                >
                    <div class="swipe-track" :style="{ transform: `translateX(${currentOffset}px)`, transition: isTransitioning ? 'transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)' : 'none' }">
                        <!-- Screen 1: Tree -->
                        <div class="swipe-screen" data-testid="tree-screen">
                            <div class="screen-content" ref="screen1Content">
                                <class-tree></class-tree>
                            </div>
                        </div>

                        <!-- Screen 2: Main content -->
                        <div class="swipe-screen" data-testid="content-screen">
                            <div class="screen-content" ref="screen2Content">
                                <router-view></router-view>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Pagination dots -->
                <div class="pagination-dots" data-testid="pagination-dots">
                    <div
                        v-for="index in 2"
                        :key="index"
                        class="dot"
                        :class="{ active: currentScreen === index - 1 }"
                        @click="goToScreen(index - 1)"
                        :data-testid="`dot-${index - 1}`"
                    ></div>
                </div>
            </div>

            <!-- Desktop: Traditional grid layout -->
            <div v-else-if="!authStore.hidePublicContent" class="container ps-5" data-testid="desktop-view">
                <div class="row">
                    <div class="col-3 ps-0" data-testid="tree-column">
                        <class-tree></class-tree>
                    </div>
                    <div class="col-9" data-testid="content-column">
                        <router-view></router-view>
                    </div>
                </div>
            </div>

            <!-- Desktop: content only (no tree) when public content is hidden -->
            <div v-else data-testid="desktop-content-only">
                <router-view></router-view>
            </div>
        </main>

        <!-- Global Error Notification (only in development, filters expected errors) -->
        <div v-if="isDevelopment && errorMessages.length > 0" class="global-error-container">
            <div
                v-for="(error, index) in errorMessages"
                :key="error.id"
                class="global-error-toast"
                :style="{ animationDelay: `${index * 0.1}s` }"
            >
                <div class="error-icon">⚠️</div>
                <div class="error-content">
                    <div class="error-title">Error</div>
                    <div class="error-message">{{ error.message }}</div>
                </div>
                <button class="error-close" @click="removeError(error.id)">×</button>
            </div>
        </div>
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
import { useObjectsStore } from '../../stores/objects'
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
const objectsStore = useObjectsStore()
const showModal    = ref(false)
const selectedType = ref('')

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

// Pull-to-refresh state
const pullDistance = ref(0)
const isRefreshing = ref(false)
const isPullAnimating = ref(false)
const pullStartY = ref(0)
const wasAtTop = ref(false)

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

// Pull-to-refresh functions
const springBack = () => {
    isPullAnimating.value = true
    pullDistance.value = 0
    setTimeout(() => { isPullAnimating.value = false }, 400)
}

const triggerRefresh = async () => {
    isRefreshing.value = true
    pullDistance.value = 0
    try {
        await objectsStore.loadClassTree()
        eventBus.emit('trigger-search')
    } catch (err) {
        console.error('Pull-to-refresh error:', err)
    }
    setTimeout(() => {
        isRefreshing.value = false
    }, 800)
}

const onTouchStart = (e) => {
    startX.value = e.touches[0].clientX
    startY.value = e.touches[0].clientY
    isDragging.value = true
    dragDirection.value = null
    isTransitioning.value = false

    // Check if at top of scrollable area for pull-to-refresh
    const screen = e.target.closest('.swipe-screen')
    wasAtTop.value = screen ? screen.scrollTop <= 0 : false
    pullStartY.value = e.touches[0].clientY
}

const onTouchMove = (e) => {
    if (!isDragging.value) return

    const deltaY = e.touches[0].clientY - startY.value

    // Pull-to-refresh: at top and pulling down
    if (wasAtTop.value && deltaY > 0 && !isRefreshing.value) {
        const screen = e.target.closest('.swipe-screen')
        if (screen && screen.scrollTop <= 0) {
            pullDistance.value = deltaY
            return
        }
    }

    const deltaX = e.touches[0].clientX - startX.value

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

    // Handle pull-to-refresh release
    if (wasAtTop.value && pullDistance.value > 0) {
        if (pullDistance.value >= 80 && !isRefreshing.value) {
            triggerRefresh()
        } else {
            springBack()
        }
        pullDistance.value = 0
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
    router.push({ path: '/', query: { q: searchQuery.value } })
}

// ========== GLOBAL ERROR HANDLING (Development only, filters expected errors) ==========
const isDevelopment = import.meta.env.DEV
const errorMessages = ref([])

// Helper: decide if an error should be ignored (no toast)
const shouldIgnoreError = (message, statusCode = null, url = null) => {
    const lowerMsg = (message || '').toLowerCase()
    // Ignore 401 Unauthorized when user is not logged in
    if (statusCode === 401) return true
    // Ignore any message containing "unauthorized" or "unauthenticated"
    if (lowerMsg.includes('unauthorized') || lowerMsg.includes('unauthenticated')) return true
    // Ignore aborted requests (e.g., navigation cancellations)
    if (lowerMsg.includes('aborted') || lowerMsg.includes('canceled')) return true
    // Ignore network errors that are expected (like offline checks)
    if (lowerMsg.includes('network error') && !navigator.onLine) return true
    // Ignore harmless ResizeObserver loop warning (browser-level, no functional impact)
    if (lowerMsg.includes('resizeobserver loop')) return true
    return false
}

const addError = (message, statusCode = null, url = null) => {
    if (shouldIgnoreError(message, statusCode, url)) return
    const id = Date.now() + Math.random()
    errorMessages.value.push({ id, message, timestamp: Date.now() })
    setTimeout(() => removeError(id), 5000)
}

const removeError = (id) => {
    const index = errorMessages.value.findIndex(e => e.id === id)
    if (index !== -1) errorMessages.value.splice(index, 1)
}

// Listen to custom errors via eventBus
eventBus.on('global-error', ({ message, statusCode, url }) => {
    if (isDevelopment) addError(message, statusCode, url)
})

// Global unhandled rejection handler
window.addEventListener('unhandledrejection', (event) => {
    if (isDevelopment) {
        const error = event.reason
        const statusCode = error?.response?.status
        const message = error?.response?.data?.message || error?.message || event.reason || 'Unhandled Promise Rejection'
        addError(message, statusCode)
    }
})

// Global error handler
const originalErrorHandler = window.onerror
window.onerror = (message, source, lineno, colno, error) => {
    if (isDevelopment) {
        const statusCode = error?.response?.status
        addError(error?.message || message, statusCode)
    }
    if (originalErrorHandler) originalErrorHandler(message, source, lineno, colno, error)
}

// Axios interceptor for errors
axios.interceptors.response.use(
    response => response,
    error => {
        if (isDevelopment) {
            const statusCode = error.response?.status
            const message = error.response?.data?.message || error.message || 'Network error'
            addError(message, statusCode, error.config?.url)
        }
        return Promise.reject(error)
    }
)
// ==============================================================

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
    (isAuthenticated, wasAuthenticated) => {
        if (isAuthenticated && route.matched.some(r => r.components?.default?.name === 'login')) {
            const redirect = route.query.redirect || '/'
            console.debug('router.replace(' + redirect + ')')
            router.replace(redirect)
        }
        // Reload class tree when auth state changes (login/logout)
        if (isAuthenticated !== wasAuthenticated) {
            // Clear stale tree data immediately so private classes don't linger after logout
            objectsStore.rootNodes = [];
            objectsStore.loadClassTree();
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
})
</script>

<style scoped>
/* All existing styles remain exactly as they were – no changes */
.navbar-light .btn {
    margin-right: 0.5rem;
}

.container {
    max-width: 100%;
}

/* Icon size utilities */
.icon-xs { width: 10px; height: 10px; }
.icon-sm { width: 14px; height: 14px; }
.icon-md { width: 20px; height: 20px; }
.icon-lg { width: 24px; height: 24px; }
.icon-xl { width: 28px; height: 28px; }

.me-1 { margin-right: 0.25rem; }
.me-2 { margin-right: 0.5rem; }

/* Fix alignment and spacing */
.navbar-collapse {
    gap: 0.5rem;
}

.navbar-nav.me-2 {
    margin-right: 0.25rem !important;
}

form.mx-2 {
    margin-left: 0.25rem !important;
    margin-right: 0.25rem !important;
}

.language-switcher {
    display: flex;
    align-items: center;
}

.user-dropdown {
    display: flex;
    align-items: center;
}

/* Consistent button styling */
.language-switcher .btn-link,
.user-dropdown .btn-link {
    display: flex;
    align-items: center;
    line-height: 1;
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

/* User icon with status indicator */
.user-icon-container {
    position: relative;
    display: inline-block;
}

.status-indicator {
    position: absolute;
    bottom: -4px;
    right: -6px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #0d6efd;
}

.status-indicator.logged-in {
    background-color: #28a745;
}

.status-indicator.logged-out {
    background-color: #dc3545;
}

/* Fix for mobile dropdowns */
@media (max-width: 768px) {
    .dropdown-menu {
        position: absolute !important;
        right: 0 !important;
        left: auto !important;
        min-width: 180px !important;
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

.dropdown-header {
    font-size: 0.75rem;
    padding: 0.5rem 1rem;
}

/* Mobile view - custom swipe implementation */
.mobile-view {
    position: relative;
    width: 100%;
    overflow: hidden;
}

/* Pull-to-refresh indicator */
.pull-refresh-indicator {
    position: relative;
    left: 0;
    right: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 0;
    overflow: hidden;
    transition: height 0.3s ease;
    background: #f8f9fa;
    border-bottom: 1px solid #e9ecef;
}

.pull-refresh-indicator.visible {
    height: 50px;
}

.pull-refresh-content {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #6c757d;
    font-size: 13px;
    font-weight: 500;
    transition: opacity 0.2s ease;
}

.pull-refresh-text {
    white-space: nowrap;
}

.pull-spinner {
    animation: pull-spin 0.8s linear infinite;
}

@keyframes pull-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
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

/* Global error notification styles */
.global-error-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 12px;
    pointer-events: none;
}

.global-error-toast {
    background: #fff3e6;
    border-left: 4px solid #ff6b6b;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 280px;
    max-width: 400px;
    pointer-events: auto;
    animation: slideIn 0.3s ease-out;
}

.error-icon {
    font-size: 20px;
}

.error-content {
    flex: 1;
}

.error-title {
    font-weight: 600;
    font-size: 0.85rem;
    color: #c92a2a;
    margin-bottom: 2px;
}

.error-message {
    font-size: 0.8rem;
    color: #343a40;
    word-break: break-word;
}

.error-close {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #6c757d;
    padding: 0 4px;
    line-height: 1;
}

.error-close:hover {
    color: #dc3545;
}

@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}
</style>
