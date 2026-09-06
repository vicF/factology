import { describe, it, expect } from 'vitest'
import { nodeSignature, planGraphUpdate } from '@/utils/graphDiff.js'

const node = (id, data = {}, extra = {}) => ({ id, text: id, width: 120, height: 160, nodeShape: 1, color: 'transparent', data, ...extra })
const line = (id, from, to) => ({ id, from, to })
const map = (entries) => new Map(entries)

describe('graphDiff', () => {
    it('reports nodes that disappear, appear, or change data', () => {
        const prev = map([
            ['A', nodeSignature(node('A', { _collapsed: true }, { width: 44, height: 44 }))],
            ['B', nodeSignature(node('B'))],
            ['gone', nodeSignature(node('gone'))],
        ])
        const next = [
            node('A', { _collapsed: false }, { width: 44, height: 44 }),
            node('B'),
            node('brand-new'),
        ]
        const plan = planGraphUpdate(prev, next, new Map(), [])
        expect(plan.removedNodeIds).toEqual(['gone'])
        expect(plan.changedNodeIds).toEqual(['A'])
        expect(plan.addNodes.map((n) => n.id)).toEqual(['brand-new'])
    })

    it('unchanged nodes and lines produce no operations', () => {
        const A = node('A'), B = node('B')
        const l1 = line('A→B', 'A', 'B')
        const prevSigs = map([['A', nodeSignature(A)], ['B', nodeSignature(B)]])
        const plan = planGraphUpdate(prevSigs, [A, B], map([['A→B', l1]]), [l1])
        expect(plan).toMatchObject({ removedNodeIds: [], changedNodeIds: [], removeLineIds: [] })
        expect(plan.addNodes).toHaveLength(0)
        expect(plan.addLines).toHaveLength(0)
    })

    it('lines of a re-created (data-changed) node are re-added', () => {
        const open = node('A', { _collapsed: false })
        const child = node('X')
        const prevSigs = map([['A', nodeSignature(node('A', { _collapsed: true }))]])
        const prevLines = map([['P→A', line('P→A', 'P', 'A')]])
        const nextLines = [line('P→A', 'P', 'A'), line('A→X', 'A', 'X')]
        const plan = planGraphUpdate(prevSigs, [open, child], prevLines, nextLines)
        expect(plan.changedNodeIds).toEqual(['A'])
        expect(plan.addNodes.map((n) => n.id)).toEqual(['X'])
        expect(plan.addLines.map((l) => l.id)).toEqual(['P→A', 'A→X'])
    })

    it('removes a stale line whose endpoints both stay visible', () => {
        const P = node('P'), F = node('F'), C = node('C')
        const prevSigs = map([['P', nodeSignature(P)], ['C', nodeSignature(C)]])
        const prevLines = map([['P→C', line('P→C', 'P', 'C')]])
        const nextLines = [line('P→F', 'P', 'F'), line('F→C', 'F', 'C')]
        const plan = planGraphUpdate(prevSigs, [P, F, C], prevLines, nextLines)
        expect(plan.removeLineIds).toEqual(['P→C'])
        expect(plan.addLines.map((l) => l.id)).toEqual(['P→F', 'F→C'])
    })

    it('a line to a removed node is left for node cleanup', () => {
        const A = node('A'), B = node('B')
        const prevSigs = map([['A', nodeSignature(A)], ['B', nodeSignature(B)]])
        const prevLines = map([['A→B', line('A→B', 'A', 'B')]])
        const plan = planGraphUpdate(prevSigs, [A], prevLines, [])
        expect(plan.removedNodeIds).toEqual(['B'])
        expect(plan.removeLineIds).toEqual([]) // B's removal cleans the line
    })
})
