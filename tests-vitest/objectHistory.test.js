// tests-vitest/objectHistory.test.js
//
// Unit tests for the persisted object-history store: cross-session recent
// items, type filtering, and recent-first suggestion ordering.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useObjectHistoryStore } from '@/stores/objectHistory'
import { useObjectCacheStore } from '@/stores/objectCache'
import { THING_TYPE, LINK_TYPE, CLASS_TYPE } from '@/constants'
import { useAuthStore } from '@/stores/auth'
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
        // History is per-user; default to a guest so the namespaced storage key
        // is deterministic. Individual tests may override with a real user.
        useAuthStore.mockImplementation(() => ({ user: { thing_id: null } }))
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

    it('recovers legacy recent entries (no snapshot) by fetching them on a fresh session', async () => {
        // Simulate the pre-snapshot storage format, as persisted by older code.
        localStorage.setItem('objectHistory:recent', JSON.stringify([
            { uuid: 'legacy-1', type: 3, selectedAt: 1 },
            { uuid: 'legacy-2', type: 4, selectedAt: 2 },
        ]))
        axios.get.mockImplementation((url) => {
            if (url === '/object/legacy-1') {
                return Promise.resolve({ data: { data: { thing_id: 'legacy-1', type: 3, name: 'Legacy Thing' } } })
            }
            if (url === '/object/legacy-2') {
                return Promise.resolve({ data: { data: { thing_id: 'legacy-2', type: 4, name: 'Legacy Link' } } })
            }
            return Promise.resolve({ data: { data: null } })
        })

        const store = useObjectHistoryStore()
        const recent = await store.getRecent(3)

        expect(recent.map(o => o.thing_id)).toEqual(['legacy-1'])
        expect(recent[0].name).toBe('Legacy Thing')
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

    it('fills the dropdown with other objects of the type when there is no history', async () => {
        // No recent, no favorites, no context — the /object fallback must fill
        // the list so the dropdown is never empty.
        axios.post.mockImplementation((url) => {
            if (url === '/object') {
                return Promise.resolve({ data: { things: [
                    { thing_id: 'o1', type: 3, name: 'One' },
                    { thing_id: 'o2', type: 3, name: 'Two' },
                ] } })
            }
            return Promise.resolve({ data: { things: [] } })
        })

        const store = useObjectHistoryStore()
        const suggestions = await store.getSuggestions(3, null, null, null, 15)

        expect(suggestions.map(o => o.thing_id)).toEqual(['o1', 'o2'])
        expect(suggestions[0]._suggestionType).toBe('other')
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

    it('getRecentSync returns persisted recent items without any await', async () => {
        const store = useObjectHistoryStore()
        const cache = useObjectCacheStore()
        cache.cacheObject('obj-1', { thing_id: 'obj-1', type: 3, name: 'One' }, 3)
        await store.recordSelection('obj-1', 3)

        // Fresh Pinia = new session with no in-memory state; the sync read must
        // still see the persisted snapshot.
        setActivePinia(createPinia())
        const fresh = useObjectHistoryStore()
        const sync = fresh.getRecentSync(3)
        expect(sync.map(o => o.thing_id)).toEqual(['obj-1'])
        expect(sync[0].name).toBe('One')
    })

    it('getRecentSync filters by type and is empty for the wrong type', async () => {
        const store = useObjectHistoryStore()
        const cache = useObjectCacheStore()
        cache.cacheObject('link-1', { thing_id: 'link-1', type: 4, name: 'L1' }, 4)
        await store.recordSelection('link-1', 4)

        expect(store.getRecentSync(4).map(o => o.thing_id)).toEqual(['link-1'])
        expect(store.getRecentSync(3)).toEqual([])
    })

    it('preloadFromServer seeds recent lists for the user from the server', async () => {
        useAuthStore.mockImplementation(() => ({ user: { thing_id: 'user-1' }, token: 'tok' }))
        axios.get.mockResolvedValue({ data: {
            links: [{ thing_id: 'lt-1', type: LINK_TYPE, name: 'LinkType' }],
            things: [{ thing_id: 't-1', type: THING_TYPE, name: 'Thing' }],
            classes: [{ thing_id: 'c-1', type: CLASS_TYPE, name: 'Class' }],
        } })

        const store = useObjectHistoryStore()
        await store.preloadFromServer()

        // The seeded lists render synchronously (no network, no hydrate await)
        // — exactly what the dropdown needs for an instant first paint.
        expect(store.getRecentSync(LINK_TYPE).map(o => o.thing_id)).toEqual(['lt-1'])
        expect(store.getRecentSync(THING_TYPE).map(o => o.thing_id)).toEqual(['t-1'])
        expect(store.getRecentSync(CLASS_TYPE).map(o => o.thing_id)).toEqual(['c-1'])

        // Seeded items are persisted too, so a fresh session renders them
        // without waiting for the preload network call again.
        setActivePinia(createPinia())
        const fresh = useObjectHistoryStore()
        expect(fresh.getRecentSync(THING_TYPE).map(o => o.thing_id)).toEqual(['t-1'])
    })

    it('preloadFromServer keeps real user selections ahead of server seeds', async () => {
        useAuthStore.mockImplementation(() => ({ user: { thing_id: 'user-1' }, token: 'tok' }))
        const store = useObjectHistoryStore()
        const cache = useObjectCacheStore()
        cache.cacheObject('picked', { thing_id: 'picked', type: 3, name: 'Picked' }, 3)
        await store.recordSelection('picked', 3)

        axios.get.mockResolvedValue({ data: {
            links: [],
            things: [{ thing_id: 'seed-1', type: THING_TYPE, name: 'Seed' }],
            classes: [],
        } })
        await store.preloadFromServer()

        expect(store.getRecentSync(THING_TYPE).map(o => o.thing_id)).toEqual(['picked', 'seed-1'])
    })

    it('getUsageRank scores recency, frequency and link-type context', async () => {
        const store = useObjectHistoryStore()
        const cache = useObjectCacheStore()
        cache.cacheObject('a', { thing_id: 'a', type: 3, name: 'A' }, 3)
        cache.cacheObject('b', { thing_id: 'b', type: 3, name: 'B' }, 3)
        cache.cacheObject('c', { thing_id: 'c', type: 3, name: 'C' }, 3)

        // a and b used under the same link-type context; b twice. c used last
        // (globally most recent, but never in that context).
        await store.recordSelection('a', 3, 3, 'linktype-1')
        await store.recordSelection('b', 3, 3, 'linktype-1')
        await store.recordSelection('b', 3, 3, 'linktype-1')
        await store.recordSelection('c', 3)

        const all = store.getUsageRank()
        expect(all.has('a')).toBe(true)
        // c is the most recently picked, so it outranks a (which only had one
        // earlier pick); b's extra frequency also outranks a.
        expect(all.get('c')).toBeGreaterThan(all.get('a'))
        expect(all.get('b')).toBeGreaterThan(all.get('a'))

        // Scoped to the link-type context, the twice-picked b outranks the
        // merely-most-recent c — the signal a picker needs ("who is always the
        // author?") that plain recency would miss.
        const ctx = store.getUsageRank(3, 'linktype-1')
        expect(ctx.get('b')).toBeGreaterThan(ctx.get('c'))
        expect(ctx.get('a')).toBeGreaterThan(0)
    })
})
