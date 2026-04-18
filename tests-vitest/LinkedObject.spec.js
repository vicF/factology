import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import LinkedObject from '@/components/Fields/LinkedObject.vue'
import ObjectField from '@/components/Fields/ObjectField.vue'
import { useObjectCacheStore } from '@/stores/objectCache'

// Provide a default mock store for all tests
beforeEach(() => {
    const mockStore = {
        hasCachedObject: vi.fn(() => false),
        getCachedObject: vi.fn(),
        fetchOrGetObject: vi.fn(),
        getRecent: vi.fn(() => []),
        searchCached: vi.fn(() => []),
    }
    useObjectCacheStore.mockReturnValue(mockStore)
})

describe('LinkedObject', () => {
    it('renders all three fields in normal mode', () => {
        const wrapper = mount(LinkedObject, {
            props: { link: { one_thing_id: '', other_thing_id: '', link_type_id: '' }, index: 0 }
        })
        // Expect three flex-group divs (one for each field)
        expect(wrapper.findAll('.flex-group').length).toBe(3)
    })

    it('renders only target field in single‑field mode', async () => {
        const wrapper = mount(LinkedObject, {
            props: { singleField: true, link: { other_thing_id: '' }, index: 0 }
        })
        await nextTick()
        // Only one flex-group should be present (the ObjectField)
        expect(wrapper.findAll('.flex-group').length).toBe(1)
        // Verify an ObjectField component is rendered
        expect(wrapper.findComponent(ObjectField).exists()).toBe(true)
    })

    it('emits update when swap is clicked', async () => {
        const link = { one_thing_id: 'a', other_thing_id: 'b', link_type_id: 'type' }
        const wrapper = mount(LinkedObject, { props: { link, index: 0 } })
        // The swap button is the first .btn-primary button in the normal mode
        const swapButton = wrapper.findAll('.btn-primary').at(0)
        await swapButton.trigger('click')
        const emitted = wrapper.emitted('update')[0][0].data
        expect(emitted.one_thing_id).toBe('b')
        expect(emitted.other_thing_id).toBe('a')
    })
})
