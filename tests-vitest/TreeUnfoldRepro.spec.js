import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TreeMenu from '@/components/TreeMenu.vue'

const mocks = vi.hoisted(() => ({
    searchState: { checkedItems: [], checkSubtree: vi.fn(), uncheckSubtree: vi.fn(), pruneEmptyAncestors: vi.fn() },
    objectsState: { rootNodes: [], loadClassTree: vi.fn() },
    emits: [],
}))

vi.mock('@/stores/search', () => ({ useSearchStore: () => mocks.searchState }))
vi.mock('@/stores/objects', () => ({ useObjectsStore: () => mocks.objectsState }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ authenticated: true }) }))
vi.mock('@/stores/ui', () => ({ useUiStore: () => ({ editMode: false }) }))
vi.mock('@factology/engine/eventBus.js', () => ({ eventBus: { on: vi.fn(), off: vi.fn(), emit: (name) => mocks.emits.push(name) } }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k) => k }) }))
vi.mock('@/lang/i18n', () => ({ i18n: { global: { locale: 'en' } } }))
vi.mock('@/utils/storage', () => ({ storageSync: { get: () => null, set: vi.fn() } }))
vi.mock('axios', () => ({ default: { post: vi.fn(), patch: vi.fn(), get: vi.fn() } }))

const PLACE = 'dc006cda-047a-4862-acf7-e215355b6890'
const CITY = '14cd9c8b-84a4-4fd2-82a8-97477ff2d5ee'

function mountTree() {
    return mount(TreeMenu, {
        props: {
            id: PLACE,
            name: 'Place',
            nodes: [{ id: CITY, name: 'City', nodes: [] }],
            depth: 1,
            type: 2,
        },
        global: {
            stubs: {
                RouterLink: { template: '<a><slot /></a>' },
                'router-link': { template: '<a><slot /></a>' },
                Image: { template: '<span />' },
                ConfirmModal: { template: '<div />' },
                IconPrivate: { template: '<span />' },
                IconPublic: { template: '<span />' },
            },
        },
    })
}

describe('tree interactions and search trigger', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.emits = []
        mocks.searchState.checkedItems = [PLACE, CITY]
        mocks.searchState.checkSubtree = vi.fn()
        mocks.searchState.uncheckSubtree = vi.fn()
        mocks.searchState.pruneEmptyAncestors = vi.fn()
    })

    it('toggle (unfold) does NOT trigger search', async () => {
        const wrapper = mountTree()
        await wrapper.find('.toggle').trigger('click')
        expect(mocks.emits).not.toContain('trigger-search')
    })

    it('clicking the checkbox of a fully-checked node UNCHECKS it and triggers search', async () => {
        const wrapper = mountTree()
        const checkbox = wrapper.find('input[type="checkbox"]')
        expect(checkbox.element.checked).toBe(true)
        await checkbox.setValue(false) // user clicks → nodeState is 'checked'
        expect(mocks.searchState.uncheckSubtree).toHaveBeenCalled()
        expect(mocks.emits).toContain('trigger-search')
    })
})
