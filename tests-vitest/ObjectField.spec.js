import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest' // Explicit imports
import ObjectField from '@/components/Fields/ObjectField.vue'
import { useObjectCacheStore } from '@/stores/objectCache'
import { CLASS_TYPE, THING_TYPE, LINK_TYPE } from '@/constants'
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
            cacheObject: vi.fn(),
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

    it('sends the field type as a search filter for class/thing/link fields', async () => {
        for (const type of [CLASS_TYPE, THING_TYPE, LINK_TYPE]) {
            axios.post.mockResolvedValue({ data: { things: [] } })
            const wrapper = mount(ObjectField, { props: { modelValue: null, type } })
            await wrapper.vm.debouncedSearch('something')
            expect(axios.post).toHaveBeenCalledWith(
                '/object',
                expect.objectContaining({ type: [type] })
            )
        }
    })

    it('does not send a type filter for server fields (they use filter_type)', async () => {
        axios.post.mockResolvedValue({ data: { things: [] } })
        const wrapper = mount(ObjectField, { props: { modelValue: null, type: 6, filterType: 'server' } })
        await wrapper.vm.debouncedSearch('something')
        expect(axios.post).toHaveBeenCalledWith(
            '/object',
            expect.objectContaining({ type: [], filter_type: 'server' })
        )
    })

    it('shows the displayName override instead of the cached object', () => {
        mockStore.getCachedObject.mockReturnValue({ thing_id: 'current-id', name: 'Cached Name' })
        const wrapper = mount(ObjectField, {
            props: { modelValue: 'current-id', displayName: 'Live New Object' }
        })
        expect(wrapper.vm.displayValue).toBe('Live New Object')
    })

    it('ignores selection of an excluded object (self-link guard)', async () => {
        const wrapper = mount(ObjectField, {
            props: { modelValue: null, excludeUuid: '123' }
        })
        await wrapper.vm.selectObject({ thing_id: '123', name: 'Me' })
        expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    })

    it('focus() exposes the visible input for programmatic focus', async () => {
        // attachTo is required: jsdom only honors focus() on elements connected
        // to the document (the default detached mount is a no-op).
        const wrapper = mount(ObjectField, { props: { modelValue: null }, attachTo: document.body })
        wrapper.vm.focus()
        await nextTick()
        expect(document.activeElement).toBe(wrapper.find('input.form-control').element)
        wrapper.unmount()
    })
})
