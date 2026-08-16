import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSearchStore } from '@/stores/search'

describe('search store class selection', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('starts with an empty selection (default is applied once the tree loads)', () => {
        const store = useSearchStore()
        expect(store.checkedItems).toEqual([])
    })

    it('checkSubtree adds all ids', () => {
        const store = useSearchStore()
        store.checkSubtree(['event', 'meeting', 'present', 'photo'])
        expect(store.checkedItems).toEqual(['event', 'meeting', 'present', 'photo'])
    })

    it('checkSubtree is idempotent and unions', () => {
        const store = useSearchStore()
        store.checkSubtree(['a', 'b'])
        store.checkSubtree(['b', 'c'])
        expect(store.checkedItems).toEqual(['a', 'b', 'c'])
    })

    it('uncheckSubtree removes only the given ids', () => {
        const store = useSearchStore()
        store.checkSubtree(['event', 'meeting', 'present', 'photo'])
        store.uncheckSubtree(['present'])
        expect(store.checkedItems).toEqual(['event', 'meeting', 'photo'])
    })

    it('uncheckSubtree on absent ids is a no-op', () => {
        const store = useSearchStore()
        store.checkSubtree(['a'])
        store.uncheckSubtree(['zzz'])
        expect(store.checkedItems).toEqual(['a'])
    })

    it('pruneEmptyAncestors drops empty internal nodes up to the root', () => {
        const store = useSearchStore()
        // Something → Event → [Disaster, Festival] ; Something → Place
        const tree = [
            { id: 'something', nodes: [
                { id: 'event', nodes: [{ id: 'disaster' }, { id: 'festival' }] },
                { id: 'place' },
            ] },
        ]
        store.checkSubtree(['something', 'event', 'disaster', 'festival', 'place'])
        store.uncheckSubtree(['disaster', 'festival'])
        store.pruneEmptyAncestors(tree)
        // Event lost all selected descendants and must be removed; Something
        // still has Place.
        expect(store.checkedItems).toEqual(['something', 'place'])
    })

    it('pruneEmptyAncestors empties the whole set when nothing remains selected', () => {
        const store = useSearchStore()
        const tree = [
            { id: 'something', nodes: [
                { id: 'event', nodes: [{ id: 'disaster' }] },
            ] },
        ]
        store.checkSubtree(['something', 'event', 'disaster'])
        store.uncheckSubtree(['disaster'])
        store.pruneEmptyAncestors(tree)
        expect(store.checkedItems).toEqual([])
    })
})
