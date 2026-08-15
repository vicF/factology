// tests-vitest/objectHistory.test.js
//
// Unit tests for the persisted object-history store: cross-session recent
// items, type filtering, and recent-first suggestion ordering.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useObjectHistoryStore } from '@/stores/objectHistory'
import { useObjectCacheStore } from '@/stores/objectCache'
import { THING_TYPE } from '@/constants'
import axios from 'axios'

// setup.js mocks these stores for component tests; this file tests the REAL
// store, so restore the actual implementations.
vi.unmock('@/stores/objectHistory')
vi.unmock('@/stores/objectCache')

vi.mock('@/stores/auth', () => ({
    useAuthStore: vi.fn(() => ({ user: { thing_id: null } })),
}))
vi.mock('axios', () => ({
    default: { post: vi.fn(), get: vi.fn() },
}))

describe('objectHistory store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
        vi.clearAllMocks()
        axios.post.mockResolvedValue({ data: { things: [] } })
        axios.get.mockResolvedValue({ data: { data: { thing_id: 'x', type: 3, name: 'X' } } })
    })

    it('records selections and returns them most-recent-first, persisting across sessions', async () => {
        const store = useObjectHistoryStore()
        const cache = useObjectCacheStore()
        cache.cacheObject('obj-1', { thing_id: 'obj-1', type: 3, name: 'One' }, 3)
        cache.cacheObject('obj-2', { thing_id: 'obj-2', type: 3, name: 'Two' }, 3)

        await store.recordSelection('obj-2', 3)
        await store.recordSelection('obj-1', 3)

        expect((await store.getRecent(3)).map(o => o.thing_id)).toEqual(['obj-1', 'obj-2'])

        // A fresh Pinia instance simulates a new session: the in-memory object
        // cache is empty, but the persisted snapshots still render recent items.
        setActivePinia(createPinia())
        const fresh = useObjectHistoryStore()
        const freshRecent = await fresh.getRecent(3)
        expect(freshRecent.map(o => o.thing_id)).toEqual(['obj-1', 'obj-2'])
        expect(freshRecent[0].name).toBe('One')
        expect(freshRecent[0].type).toBe(3)
    })

    it('filters recent items by the requested type', async () => {
        const store = useObjectHistoryStore()
        const cache = useObjectCacheStore()
        cache.cacheObject('thing-1', { thing_id: 'thing-1', type: 3, name: 'T1' }, 3)
        cache.cacheObject('link-1', { thing_id: 'link-1', type: 4, name: 'L1' }, 4)

        await store.recordSelection('link-1', 4)
        await store.recordSelection('thing-1', 3)

        expect((await store.getRecent(3)).map(o => o.thing_id)).toEqual(['thing-1'])
        expect((await store.getRecent(4)).map(o => o.thing_id)).toEqual(['link-1'])
    })

    it('puts recent items on top of suggestions and fills the rest with other sources', async () => {
        const store = useObjectHistoryStore()
        const cache = useObjectCacheStore()
        cache.cacheObject('recent-1', { thing_id: 'recent-1', type: 3, name: 'R1' }, 3)
        cache.cacheObject('freq-1', { thing_id: 'freq-1', type: 3, name: 'F1' }, 3)

        await store.recordSelection('recent-1', 3)
        await store.recordSelection('freq-1', 3)
        await store.recordSelection('freq-1', 3)

        // Global suggestions arrive from the network and must only fill the
        // slots left free by the local recent list.
        axios.post.mockImplementation((url) => {
            if (url === '/suggest/links') {
                return Promise.resolve({ data: { data: ['global-1'] } })
            }
            return Promise.resolve({ data: { things: [] } })
        })
        axios.get.mockImplementation(() => Promise.resolve({
            data: { data: { thing_id: 'global-1', type: 3, name: 'G1' } },
        }))

        const suggestions = await store.getSuggestions(3, 3, 'linktype', 'one-thing', 15)
        expect(suggestions.map(o => o.thing_id)).toEqual(['freq-1', 'recent-1', 'global-1'])
        expect(suggestions[0]._suggestionType).toBe('recent')
    })

    it('respects the type filter across all suggestion sources', async () => {
        const store = useObjectHistoryStore()
        const cache = useObjectCacheStore()
        cache.cacheObject('thing-1', { thing_id: 'thing-1', type: 3, name: 'T1' }, 3)
        cache.cacheObject('link-1', { thing_id: 'link-1', type: 4, name: 'L1' }, 4)

        await store.recordSelection('link-1', 4)
        await store.recordSelection('thing-1', 3)

        expect((await store.getSuggestions(THING_TYPE, null, null, null, 15)).map(o => o.thing_id))
            .toEqual(['thing-1'])
        expect((await store.getSuggestions(4, null, null, null, 15)).map(o => o.thing_id))
            .toEqual(['link-1'])
    })
})
