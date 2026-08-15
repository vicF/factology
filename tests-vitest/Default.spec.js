// tests-vitest/Default.spec.js
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DefaultLayout from '@/components/layouts/Default.vue'
import axios from 'axios'

// Mutable auth state so each test can mount with the desired user.
const authState = vi.hoisted(() => ({
    user: null,
    authenticated: false,
    token: null,
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useRoute: () => ({ path: '/', query: {}, matched: [] }),
}))

vi.mock('@/stores/auth', () => ({
    useAuthStore: () => ({
        user: authState.user,
        authenticated: authState.authenticated,
        token: authState.token,
        registrationEnabled: true,
        hidePublicContent: false,
        logout: vi.fn(),
        login: vi.fn(),
    }),
}))

vi.mock('@/stores/search', () => ({
    useSearchStore: () => ({
        searchQuery: '',
        setSearchQuery: vi.fn(),
        toggleFilters: vi.fn(),
        getFilterParams: vi.fn(() => ({})),
    }),
}))

vi.mock('@/stores/objects', () => ({
    useObjectsStore: () => ({
        rootNodes: [],
        loadClassTree: vi.fn(),
    }),
}))

vi.mock('@/lang/i18n', () => ({
    setLanguage: vi.fn(),
}))

function mountLayout(user = null) {
    authState.user = user
    authState.authenticated = !!user
    authState.token = user ? 'token' : null
    return mount(DefaultLayout, {
        global: {
            stubs: {
                RouterLink: true,
                RouterView: true,
                ClassTree: true,
                SearchFilterPanel: true,
            },
        },
    })
}

describe('Default layout — admin mode indicator', () => {
    beforeEach(() => {
        axios.get.mockResolvedValue({ data: { id: 1, name: 'Alice', is_admin: false } })
    })

    it('shows no admin indicator for a regular logged-in user', () => {
        const wrapper = mountLayout({ id: 1, name: 'Alice', is_admin: false })

        expect(wrapper.find('[data-testid="admin-icon"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="admin-role-badge"]').exists()).toBe(false)
        // Regular blue navbar
        expect(wrapper.find('nav.navbar').element.style.backgroundColor).toBe('rgb(13, 110, 253)')
    })

    it('shows no admin indicator for guests', () => {
        const wrapper = mountLayout(null)

        expect(wrapper.find('[data-testid="admin-icon"]').exists()).toBe(false)
        expect(wrapper.find('nav.navbar').element.style.backgroundColor).toBe('rgb(13, 110, 253)')
    })

    it('shows admin icon and role label when the user is an admin', () => {
        const wrapper = mountLayout({ id: 1, name: 'Alice', is_admin: true })

        expect(wrapper.find('[data-testid="admin-icon"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="admin-role-badge"]').text()).toBe('Admin')
        // Red navbar signals admin mode
        expect(wrapper.find('nav.navbar').element.style.backgroundColor).toBe('rgb(176, 42, 55)')
    })

    it('hides the status indicator in admin mode (it would overlap the icon)', () => {
        const wrapper = mountLayout({ id: 1, name: 'Alice', is_admin: true })

        expect(wrapper.find('[data-testid="logged-in-indicator"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="logged-out-indicator"]').exists()).toBe(false)
    })

    it('keeps the logged-in status indicator for a regular user', () => {
        const wrapper = mountLayout({ id: 1, name: 'Alice', is_admin: false })

        expect(wrapper.find('[data-testid="logged-in-indicator"]').exists()).toBe(true)
    })
})
