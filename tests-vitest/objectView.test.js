import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useObjectViewStore, DEFAULT_DEPTH } from '@/stores/objectView'

describe('objectView store — filter persistence across objects', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
    })

    it('keeps checked/unchecked tree state when the viewed object changes', () => {
        const store = useObjectViewStore()
        store.checkedIds = ['class-human', 'type-married', 'type-imported']
        store.seenIds.add('type-imported')

        store.setFilters(['class-human', 'type-married'], [])
        expect(store.filtersReady).toBe(true)

        store.setUid('object-b')

        expect(store.uid).toBe('object-b')
        // The user's tree selections survive navigation…
        expect(store.checkedIds).toContain('class-human')
        expect(store.seenIds.has('type-imported')).toBe(true)
        // …but the published restriction is dropped until the new object's
        // neighborhood is re-collected (so it never bleeds across objects).
        expect(store.filtersReady).toBe(false)
        expect(store.selectedClasses).toEqual([])
    })

    it('default depth is 2 and setDepth clamps to 1..4', () => {
        const store = useObjectViewStore()
        expect(store.depth).toBe(DEFAULT_DEPTH)
        store.setDepth(0)
        expect(store.depth).toBe(1)
        store.setDepth(99)
        expect(store.depth).toBe(4)
    })
})
