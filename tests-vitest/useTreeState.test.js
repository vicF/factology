import { describe, it, expect, beforeEach } from 'vitest'
import { useTreeState, defaultIsOpen, COLLAPSE_FROM_DEPTH } from '@/composables/useTreeState'

describe('useTreeState', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('collapses from the configured depth', () => {
        expect(COLLAPSE_FROM_DEPTH).toBe(1)
        expect(defaultIsOpen(0)).toBe(true)
        expect(defaultIsOpen(1)).toBe(false)
        expect(defaultIsOpen(2)).toBe(false)
    })

    it('isOpen returns the depth default when there is no override', () => {
        const treeState = useTreeState()
        expect(treeState.isOpen('a', 0)).toBe(true)
        expect(treeState.isOpen('b', 1)).toBe(false)
        expect(treeState.isOpen('c', 2)).toBe(false)
    })

    it('persists an override so a fresh call returns it (simulating remount)', () => {
        const treeState = useTreeState()
        treeState.setOpen('b', true)
        // Fresh instance reads the persisted state
        expect(useTreeState().isOpen('b', 1)).toBe(true)
    })

    it('override wins over the depth default in both directions', () => {
        const treeState = useTreeState()
        treeState.setOpen('a', false) // depth 0 defaults to open, user collapsed it
        treeState.setOpen('b', true)  // depth 1 defaults to closed, user expanded it
        expect(treeState.isOpen('a', 0)).toBe(false)
        expect(treeState.isOpen('b', 1)).toBe(true)
        // Untouched nodes keep their defaults
        expect(treeState.isOpen('c', 0)).toBe(true)
        expect(treeState.isOpen('d', 1)).toBe(false)
    })

    it('falls back to defaults when stored JSON is corrupted', () => {
        localStorage.setItem('factology:classTree:nodeState', '{invalid json')
        const treeState = useTreeState()
        expect(treeState.isOpen('a', 0)).toBe(true)
        expect(treeState.isOpen('b', 1)).toBe(false)
        // And it can still be written afterwards
        treeState.setOpen('b', true)
        expect(treeState.isOpen('b', 1)).toBe(true)
    })
})
