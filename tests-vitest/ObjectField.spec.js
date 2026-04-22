import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest' // Explicit imports
import ObjectField from '@/components/Fields/ObjectField.vue'
import { useObjectCacheStore } from '@/stores/objectCache'
import axios from 'axios'

// 1. Mock dependencies at the top level
vi.mock('axios')
vi.mock('@/stores/objectCache', () => ({
    useObjectCacheStore: vi.fn()
}))

describe('ObjectField', () => {
    let mockStore

    beforeEach(() => {
        vi.clearAllMocks()

        // 2. Initialize a fresh mock store before each test
        mockStore = {
            getRecent: vi.fn(() => []),
            hasCachedObject: vi.fn(() => false),
            getCachedObject: vi.fn(),
            fetchOrGetObject: vi.fn(),
            searchCached: vi.fn(() => []),
        }

        useObjectCacheStore.mockReturnValue(mockStore)
    })

    it('opens dropdown on focus and loads recent objects', async () => {
        // Override the default mock for this specific test
        const mockData = [{ thing_id: '1', name: 'Test' }]
        mockStore.getRecent.mockReturnValue(mockData)

        const wrapper = mount(ObjectField, {
            props: { modelValue: null }
        })

        // Trigger focus to open dropdown
        await wrapper.find('input').trigger('focus')

        expect(wrapper.vm.isOpen).toBe(true)
        expect(mockStore.getRecent).toHaveBeenCalled()

        // Checking internal state (computed property)
        expect(wrapper.vm.filteredObjects).toEqual(mockData)
    })

    it('emits update:modelValue when an item is selected', async () => {
        const wrapper = mount(ObjectField)

        // Manually trigger the selection method
        await wrapper.vm.selectObject({ thing_id: '123', name: 'Selected' })

        const emitted = wrapper.emitted('update:modelValue')
        expect(emitted).toBeTruthy()
        expect(emitted[0]).toEqual(['123'])
    })
})
