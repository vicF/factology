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
})
