import { mount } from '@vue/test-utils'
import ObjectField from '@/components/Fields/ObjectField.vue'
import { useObjectCacheStore } from '@/stores/objectCache'
import axios from 'axios'

vi.mock('axios')

describe('ObjectField', () => {
    it('opens dropdown on focus and loads recent objects', async () => {
        const mockGetRecent = vi.fn().mockReturnValue([{ thing_id: '1', name: 'Test' }])
        // Create a complete mock store object
        const mockStore = {
            getRecent: mockGetRecent,
            hasCachedObject: vi.fn(),
            getCachedObject: vi.fn(),
            fetchOrGetObject: vi.fn(),
            searchCached: vi.fn(),
        }
        useObjectCacheStore.mockReturnValue(mockStore)

        const wrapper = mount(ObjectField, { props: { modelValue: null } })
        await wrapper.find('input').trigger('focus')
        expect(wrapper.vm.isOpen).toBe(true)
        expect(mockGetRecent).toHaveBeenCalled()
        // The dropdown content may not be rendered immediately; we can check the component state
        // Alternatively, check that filteredObjects computed contains the mock data
        expect(wrapper.vm.filteredObjects).toEqual([{ thing_id: '1', name: 'Test' }])
    })

    it('emits update:modelValue when an item is selected', async () => {
        const wrapper = mount(ObjectField)
        wrapper.vm.selectObject({ thing_id: '123', name: 'Selected' })
        expect(wrapper.emitted('update:modelValue')[0]).toEqual(['123'])
    })
})
