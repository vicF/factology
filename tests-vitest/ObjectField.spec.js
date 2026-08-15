import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest' // Explicit imports
import ObjectField from '@/components/Fields/ObjectField.vue'
import { useObjectCacheStore } from '@/stores/objectCache'
import { useObjectHistoryStore } from '@/stores/objectHistory'
import { CLASS_TYPE, THING_TYPE, LINK_TYPE } from '@/constants'
import axios from 'axios'

// 1. Mock dependencies at the top level
vi.mock('axios')
vi.mock('@/stores/objectCache', () => ({
    useObjectCacheStore: vi.fn()
}))
vi.mock('@/stores/objectHistory', () => ({
    useObjectHistoryStore: vi.fn()
}))

describe('ObjectField', () => {
    let mockStore
    let mockHistory

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

        mockHistory = {
            hydrate: vi.fn(() => Promise.resolve()),
            getRecent: vi.fn(() => Promise.resolve([])),
            getSuggestions: vi.fn(() => Promise.resolve([])),
            recordSelection: vi.fn(),
        }
        useObjectHistoryStore.mockReturnValue(mockHistory)
    })

    it('opens dropdown on focus and shows persisted recent objects first', async () => {
        // Override the default mock for this specific test
        const mockData = [{ thing_id: '1', name: 'Test', type: THING_TYPE }]
        mockHistory.getRecent.mockResolvedValue(mockData)
        mockHistory.getSuggestions.mockResolvedValue(mockData)

        const wrapper = mount(ObjectField, {
            props: { modelValue: null }
        })

        // Trigger focus to open dropdown
        await wrapper.find('input').trigger('focus')
        await flushPromises()

        expect(wrapper.vm.isOpen).toBe(true)
        expect(mockHistory.getRecent).toHaveBeenCalled()
        expect(mockHistory.getRecent).toHaveBeenCalledWith(THING_TYPE, 15)

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

    it('shows a loading state while the suggestion list is being fetched', async () => {
        mockHistory.getRecent.mockResolvedValue([])
        let resolveSuggestions
        mockHistory.getSuggestions.mockReturnValue(new Promise(r => { resolveSuggestions = r }))

        const wrapper = mount(ObjectField, { props: { modelValue: null } })
        await wrapper.find('input').trigger('focus')
        await flushPromises()

        // The initial list is still assembling (network-backed filler pending),
        // so the dropdown must show a spinner instead of looking empty.
        expect(wrapper.vm.suggestionsLoading).toBe(true)

        resolveSuggestions([{ thing_id: '1', name: 'Loaded', type: THING_TYPE }])
        await flushPromises()

        expect(wrapper.vm.suggestionsLoading).toBe(false)
        expect(wrapper.vm.filteredObjects.map(o => o.thing_id)).toEqual(['1'])
    })

    it('shows a spinner while the debounced search is pending instead of "nothing found"', async () => {
        vi.useFakeTimers()
        try {
            mockHistory.getRecent.mockResolvedValue([])
            mockHistory.getSuggestions.mockResolvedValue([])
            axios.post.mockResolvedValue({ data: { things: [] } })

            const wrapper = mount(ObjectField, { props: { modelValue: null } })
            await wrapper.find('input').trigger('focus')
            await flushPromises()

            // Typing immediately turns on the spinner (the debounced request is
            // pending), so the empty "no results" message never flashes.
            await wrapper.find('input').setValue('needle')
            expect(wrapper.vm.loading).toBe(true)
            expect(wrapper.vm.suggestionsLoading).toBe(false)

            // After the debounce fires and the request resolves, the spinner stops.
            await vi.advanceTimersByTimeAsync(320)
            await flushPromises()
            expect(wrapper.vm.loading).toBe(false)
        } finally {
            vi.useRealTimers()
        }
    })

    it('does not clobber the search view with late-arriving suggestions while typing', async () => {
        mockHistory.getRecent.mockResolvedValue([{ thing_id: '1', name: 'Recent', type: THING_TYPE }])
        let resolveSuggestions
        mockHistory.getSuggestions.mockReturnValue(new Promise(r => { resolveSuggestions = r }))

        const wrapper = mount(ObjectField, { props: { modelValue: null } })
        await wrapper.find('input').trigger('focus')
        await nextTick()

        // The user starts typing before the (slow) suggestion pipeline resolves.
        await wrapper.find('input').setValue('needle')
        resolveSuggestions([{ thing_id: '2', name: 'Suggestion', type: THING_TYPE }])
        await flushPromises()

        // The initial recent list is NOT replaced by the late suggestions — the
        // search view stays in charge until the user clears the text.
        expect(wrapper.vm.pendingSuggestions.map(o => o.thing_id)).toEqual(['1'])
        expect(wrapper.vm.searchText).toBe('needle')
    })

    it('initial list is stable and does not re-read the volatile object cache', async () => {
        mockHistory.getRecent.mockResolvedValue([{ thing_id: '1', name: 'Recent', type: THING_TYPE }])
        mockHistory.getSuggestions.mockResolvedValue([{ thing_id: '1', name: 'Recent', type: THING_TYPE }])
        mockStore.getRecent.mockReturnValue([{ thing_id: '999', name: 'Volatile', type: THING_TYPE }])

        const wrapper = mount(ObjectField, { props: { modelValue: null } })
        await wrapper.find('input').trigger('focus')
        await flushPromises()

        // The dropdown list comes from the persisted recent items, not from the
        // cache store's in-memory recent list (which changes as objects get
        // cached elsewhere in the app).
        expect(wrapper.vm.filteredObjects.map(o => o.thing_id)).toEqual(['1'])
        expect(mockStore.getRecent).not.toHaveBeenCalled()
    })
})
