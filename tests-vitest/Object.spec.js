// tests-vitest/Object.spec.js
//
// Edit-mode gating for Object.vue: the header actions, per-link actions, and
// the visibility badge only render when the global edit-mode toggle is ON.

import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ObjectView from '@/components/Object.vue'
import axios from 'axios'

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn() }),
    useRoute: () => ({ params: { uid: 'obj-1' }, fullPath: '/object/obj-1' }),
}))

// The merged component imports the real i18n module transitively (via
// utils/localized.js), which calls createI18n — the mock must provide it so
// the module loads, while useI18n keeps the view's t() trivial.
vi.mock('vue-i18n', () => {
    const composer = {
        locale: { value: 'en' },
        t: (key) => key,
    }
    return {
        createI18n: () => ({
            global: composer,
            install: (app) => { app.config.globalProperties.$t = composer.t },
        }),
        useI18n: () => ({ t: (key) => key }),
    }
})

const authState = vi.hoisted(() => ({
    authenticated: true,
    user: { thing_id: 'user-1', name: 'Alice', is_admin: false },
}))
vi.mock('@/stores/auth', () => ({
    useAuthStore: () => ({
        authenticated: authState.authenticated,
        user: authState.user,
    }),
}))

vi.mock('@/stores/objects', () => ({
    useObjectsStore: () => ({
        rootNodes: [],
        loadClassTree: vi.fn(),
    }),
}))

const uiState = vi.hoisted(() => ({ editMode: false }))
vi.mock('@/stores/ui', () => ({
    useUiStore: () => uiState,
}))

// Graph is a defineAsyncComponent; give it a trivial module so v-show doesn't
// try to pull in the heavy graph library during tests.
vi.mock('@/components/Graph.vue', () => ({
    default: { name: 'Graph', template: '<div />' },
}))

const OBJECT = {
    thing_id: 'obj-1',
    name: 'Test Object',
    type: 3,
    public: 1,
    owner: 'user-1',
    owner_name: 'Alice',
    class: { thing_id: 'class-1', name: 'Test Class', type: 2 },
    links: [
        {
            link_id: 'link-1',
            name: 'Related Thing',
            type: 3,
            one_thing_id: 'obj-1',
            other_thing_id: 'thing-2',
            target_public: 1,
        },
    ],
}

function mountObject() {
    return mount(ObjectView, {
        global: {
            stubs: {
                RouterLink: true,
                EditObject: true,
                EditLinkModal: true,
                ConfirmModal: true,
                LinkDescription: true,
                Image: true,
                TranslatedBadge: true,
            },
            mocks: {
                $t: (k) => k,
                $truncateText: (t) => t,
                $objectName: (o) => o?.name || '',
                $objectDescription: (o) => o?.description || '',
                $dateFromDb: (d) => d,
                $resolveLocalized: (x) => x,
                $fieldText: (x) => x,
            },
            provide: { getThumbUrl: () => '' },
        },
    })
}

describe('Object view — edit mode gating', () => {
    beforeEach(() => {
        axios.get.mockResolvedValue({ data: { data: OBJECT } })
        uiState.editMode = false
    })

    it('hides all editing controls when edit mode is OFF', async () => {
        const wrapper = mountObject()
        await flushPromises()

        expect(wrapper.find('.object-actions').exists()).toBe(false)
        expect(wrapper.find('.link-actions').exists()).toBe(false)
        expect(wrapper.find('.visibility-badge').exists()).toBe(false)
    })

    it('shows all editing controls when edit mode is ON', async () => {
        uiState.editMode = true
        const wrapper = mountObject()
        await flushPromises()

        expect(wrapper.find('.object-actions').exists()).toBe(true)
        expect(wrapper.find('.link-actions').exists()).toBe(true)
        expect(wrapper.find('.visibility-badge').exists()).toBe(true)
    })
})

describe('Object view — admin edit/delete on another user\'s object', () => {
    beforeEach(() => {
        axios.get.mockResolvedValue({
            data: { data: { ...OBJECT, owner: 'other-user', owner_name: 'Victor Fokin' } },
        })
        uiState.editMode = true
        authState.user = { thing_id: 'user-1', name: 'Alice', is_admin: true }
    })

    const deleteButton = (wrapper) =>
        wrapper.findAll('.object-actions button').find(b => b.text().includes('Delete'))

    it('enables Delete for admins on another user\'s object', async () => {
        const wrapper = mountObject()
        await flushPromises()

        expect(deleteButton(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('shows the other-owner warning banner for admins', async () => {
        const wrapper = mountObject()
        await flushPromises()

        const banner = wrapper.find('.alert-warning')
        expect(banner.exists()).toBe(true)
        expect(banner.text()).toContain('You are editing an object that belongs to')
    })

    it('warns about the owner in the delete confirmation', async () => {
        const confirmSpy = vi.fn(() => true)
        vi.stubGlobal('confirm', confirmSpy)
        const wrapper = mountObject()
        await flushPromises()

        await deleteButton(wrapper).trigger('click')
        await flushPromises()

        expect(confirmSpy).toHaveBeenCalledTimes(1)
        expect(confirmSpy.mock.calls[0][0]).toContain('You are going to delete the object that belongs to')
        expect(axios.delete).toHaveBeenCalledWith('/object/obj-1')
        vi.unstubAllGlobals()
    })

    it('keeps Delete disabled and hides the banner for a non-admin on another user\'s object', async () => {
        authState.user = { thing_id: 'user-1', name: 'Alice', is_admin: false }
        const wrapper = mountObject()
        await flushPromises()

        expect(deleteButton(wrapper).attributes('disabled')).toBeDefined()
        expect(wrapper.find('.alert-warning').exists()).toBe(false)
    })
})
