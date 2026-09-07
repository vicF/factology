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

// Mutable ui-store state so each test can mount with edit mode on/off.
const uiState = vi.hoisted(() => ({
    editMode: false,
    toggleEditMode: vi.fn(),
}))

vi.mock('@/stores/ui', () => ({
    useUiStore: () => uiState,
}))

vi.mock('@/lang/i18n', () => ({
    setLanguage: vi.fn(),
    i18n: { global: { locale: 'en' } },
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
            mocks: {
                $t: (key) => key,
            },
        },
    })
}

describe('Default layout — admin mode indicator', () => {
    beforeEach(() => {
        axios.get.mockResolvedValue({ data: { id: 1, name: 'Alice', is_admin: false } })
        uiState.editMode = false
        uiState.toggleEditMode.mockClear()
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

describe('Default layout — edit mode toggle', () => {
    beforeEach(() => {
        axios.get.mockResolvedValue({ data: { id: 1, name: 'Alice', is_admin: false } })
        uiState.editMode = false
        uiState.toggleEditMode.mockClear()
    })

    it('hides the edit-mode toggle for guests', () => {
        const wrapper = mountLayout(null)

        expect(wrapper.find('[data-testid="edit-mode-toggle"]').exists()).toBe(false)
    })

    it('shows the edit-mode toggle for a logged-in user (off by default)', () => {
        const wrapper = mountLayout({ id: 1, name: 'Alice', is_admin: false })

        const toggle = wrapper.find('[data-testid="edit-mode-toggle"]')
        expect(toggle.exists()).toBe(true)
        expect(toggle.classes()).not.toContain('active')
        expect(wrapper.find('[data-testid="edit-mode-active-dot"]').exists()).toBe(false)
    })

    it('marks the toggle as active and shows the dot when edit mode is on', () => {
        uiState.editMode = true
        const wrapper = mountLayout({ id: 1, name: 'Alice', is_admin: false })

        const toggle = wrapper.find('[data-testid="edit-mode-toggle"]')
        expect(toggle.classes()).toContain('active')
        expect(wrapper.find('[data-testid="edit-mode-active-dot"]').exists()).toBe(true)
    })

    it('calls toggleEditMode when clicked', async () => {
        const wrapper = mountLayout({ id: 1, name: 'Alice', is_admin: false })

        await wrapper.find('[data-testid="edit-mode-toggle"]').trigger('click')

        expect(uiState.toggleEditMode).toHaveBeenCalled()
    })
})
