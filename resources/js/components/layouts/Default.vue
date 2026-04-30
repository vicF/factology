<template>
    <div class="app-container">
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
const currentScreen = ref(0)
const startX = ref(0)
const startY = ref(0)
const currentOffset = ref(0)
const isTransitioning = ref(false)
const screenWidth = ref(0)
const isDragging = ref(false)
const dragDirection = ref(null) // 'horizontal' or 'vertical'

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
        })
    }
})

// Watch for route changes
watch(() => route.path, () => {
    checkAuth()
    // Reset to first screen on route change
    if (isMobile.value && currentScreen.value !== 0) {
        goToScreen(0)
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

/* Mobile view - custom swipe implementation */
.mobile-view {
    position: relative;
    width: 100%;
    overflow: hidden;
}

.swipe-container {
    width: 100%;
    overflow: hidden;
    touch-action: pan-y pinch-zoom; /* Allow vertical scrolling */
}

.swipe-track {
    display: flex;
    flex-direction: row;
    width: 200%; /* 2 screens = 200% */
    height: calc(100vh - 70px);
    will-change: transform;
}

.swipe-screen {
    flex: 0 0 50%; /* Each screen takes exactly 50% of track */
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
