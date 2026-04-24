import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest' // Explicit imports for stability
import LinkedObject from '@/components/Fields/LinkedObject.vue'
import ObjectField from '@/components/Fields/ObjectField.vue'
import { useObjectCacheStore } from '@/stores/objectCache'

// 1. Mock the store module at the top level
vi.mock('@/stores/objectCache', () => ({
    useObjectCacheStore: vi.fn()
}))

describe('LinkedObject', () => {
    let mockStore

    beforeEach(() => {
        // 2. Clear all mocks and set up the default store state before each test
        vi.clearAllMocks()

        mockStore = {
            hasCachedObject: vi.fn(() => false),
            getCachedObject: vi.fn(),
            fetchOrGetObject: vi.fn(),
            getRecent: vi.fn(() => []),
            searchCached: vi.fn(() => []),
        }

        // Ensure useObjectCacheStore returns our mock object
        useObjectCacheStore.mockReturnValue(mockStore)
    })

    it('renders all three fields in normal mode', () => {
        const wrapper = mount(LinkedObject, {
            props: {
                link: { one_thing_id: '', other_thing_id: '', link_type_id: '' },
                index: 0
            },
            global: {
                stubs: {
                    // Stubbing ObjectField if it has complex logic,
                    // though usually not needed if it's a simple child
                    // ObjectField: true
                }
            }
        })

        // Expect three flex-group divs (one for each field)
        expect(wrapper.findAll('.flex-group').length).toBe(3)
    })

    it('renders only target field in single‑field mode', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                singleField: true,
                link: { other_thing_id: '' },
                index: 0
            }
        })
        await nextTick()

        // Only one flex-group should be present (the ObjectField)
        expect(wrapper.findAll('.flex-group').length).toBe(1)
        // Verify an ObjectField component is rendered
        expect(wrapper.findComponent(ObjectField).exists()).toBe(true)
    })

    it('emits update when swap is clicked', async () => {
        const link = { one_thing_id: 'a', other_thing_id: 'b', link_type_id: 'type' }
        const wrapper = mount(LinkedObject, {
            props: { link, index: 0 }
        })

        // Target the swap button specifically by its icon or class if possible
        // but sticking to your current selector:
        const swapButton = wrapper.find('.btn-primary')
        await swapButton.trigger('click')

        // Check emitted events
        const emitted = wrapper.emitted('update')
        expect(emitted).toBeTruthy()

        const payload = emitted[0][0].data
        expect(payload.one_thing_id).toBe('b')
        expect(payload.other_thing_id).toBe('a')
    })
})
