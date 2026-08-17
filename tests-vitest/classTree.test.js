import { describe, it, expect } from 'vitest'
import { collectSubtreeIds, nodeSelectionState, pruneEmptyNodes } from '@/utils/classTree'

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

    it('checked when all children are selected even if the node itself is not in the set', () => {
        expect(nodeSelectionState('event', tree.nodes, ['meeting', 'present', 'photo'])).toBe('checked')
        expect(nodeSelectionState('meeting', [{ id: 'present' }], ['present'])).toBe('checked')
    })

    it('semi when a descendant is unselected (Event minus Disaster scenario)', () => {
        expect(nodeSelectionState('event', tree.nodes, ['event', 'meeting', 'present'])).toBe('semi')
    })

    it('semi when some but not all children are selected', () => {
        expect(nodeSelectionState('event', tree.nodes, ['meeting', 'present'])).toBe('semi')
    })

    it('unchecked when no descendant is selected', () => {
        expect(nodeSelectionState('event', tree.nodes, ['event'])).toBe('unchecked')
        expect(nodeSelectionState('event', tree.nodes, ['other'])).toBe('unchecked')
    })

    it('leaf is checked only when itself is selected', () => {
        expect(nodeSelectionState('photo', [], ['photo'])).toBe('checked')
        expect(nodeSelectionState('photo', [], [])).toBe('unchecked')
    })
})

// Something → Event → Disaster, Festival ; Something → Place
const pruneTree = [
    { id: 'something', nodes: [
        { id: 'event', nodes: [
            { id: 'disaster' },
            { id: 'festival' },
        ] },
        { id: 'place' },
    ] },
]

describe('pruneEmptyNodes', () => {
    it('removes internal nodes that have no selected descendants', () => {
        expect(pruneEmptyNodes(pruneTree, ['something', 'event', 'place'])).toEqual(['something', 'place'])
    })

    it('keeps internal nodes that still have at least one selected descendant', () => {
        expect(pruneEmptyNodes(pruneTree, ['something', 'event', 'place', 'festival']))
            .toEqual(['something', 'event', 'place', 'festival'])
    })

    it('cascades removal all the way to the root when nothing is left selected', () => {
        expect(pruneEmptyNodes(pruneTree, ['something', 'event'])).toEqual([])
    })

    it('keeps selected leaves', () => {
        expect(pruneEmptyNodes(pruneTree, ['disaster'])).toEqual(['disaster'])
        expect(pruneEmptyNodes(pruneTree, ['something', 'place'])).toEqual(['something', 'place'])
    })
})
