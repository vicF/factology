import { describe, it, expect } from 'vitest'
import { collectSubtreeIds, nodeSelectionState } from '@/utils/classTree'

// Event → Meeting → Present ; Event → Photo
const tree = {
    id: 'event',
    nodes: [
        { id: 'meeting', nodes: [{ id: 'present' }] },
        { id: 'photo' },
    ],
}

describe('collectSubtreeIds', () => {
    it('collects descendant ids depth-first, excluding the node itself', () => {
        expect(collectSubtreeIds(tree.nodes)).toEqual(['meeting', 'present', 'photo'])
    })

    it('returns [] for empty children', () => {
        expect(collectSubtreeIds([])).toEqual([])
    })

    it('returns [] for undefined children', () => {
        expect(collectSubtreeIds(undefined)).toEqual([])
    })
})

describe('nodeSelectionState', () => {
    it('checked when the whole subtree is selected', () => {
        expect(nodeSelectionState('event', tree.nodes, ['event', 'meeting', 'present', 'photo'])).toBe('checked')
    })

    it('semi when a descendant is unselected (Event minus Disaster scenario)', () => {
        expect(nodeSelectionState('event', tree.nodes, ['event', 'meeting', 'present'])).toBe('semi')
    })

    it('semi when only the node itself is selected', () => {
        expect(nodeSelectionState('event', tree.nodes, ['event'])).toBe('semi')
    })

    it('semi when only part of the subtree is selected without the node itself', () => {
        expect(nodeSelectionState('meeting', [{ id: 'present' }], ['present'])).toBe('semi')
    })

    it('unchecked when nothing in the subtree is selected', () => {
        expect(nodeSelectionState('event', tree.nodes, ['other'])).toBe('unchecked')
    })

    it('leaf is checked only when itself is selected', () => {
        expect(nodeSelectionState('photo', [], ['photo'])).toBe('checked')
        expect(nodeSelectionState('photo', [], [])).toBe('unchecked')
    })
})
