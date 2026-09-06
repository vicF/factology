// tests-vitest/uiStore.test.js
//
// Unit tests for the global edit-mode toggle store: defaults, seeding from
// persisted storage, and persistence on toggle.

import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUiStore } from '@/stores/ui'

describe('ui store — edit mode', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        localStorage.clear()
    })

    it('defaults to edit mode OFF', () => {
        const store = useUiStore()
        expect(store.editMode).toBe(false)
    })

    it('seeds from persisted localStorage value', () => {
        localStorage.setItem('editMode', '1')
        const store = useUiStore()
        expect(store.editMode).toBe(true)
    })

    it('toggles edit mode and persists the new value', () => {
        const store = useUiStore()
        store.toggleEditMode()
        expect(store.editMode).toBe(true)
        expect(localStorage.getItem('editMode')).toBe('1')

        store.toggleEditMode()
        expect(store.editMode).toBe(false)
        expect(localStorage.getItem('editMode')).toBe('0')
    })

    it('respects persisted state across store instances (new session)', () => {
        const store = useUiStore()
        store.toggleEditMode()

        setActivePinia(createPinia())
        const fresh = useUiStore()
        expect(fresh.editMode).toBe(true)
    })
})
