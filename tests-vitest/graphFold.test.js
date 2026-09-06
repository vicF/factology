import { describe, it, expect } from 'vitest'
import { foldChildren, makeGroupKey } from '@/utils/graphFold'

const HUMAN = 'human-class'

const child = (id, { type = null, cls = null } = {}) => ({ id, _type: type, _cls: cls })

const typeOf = (c) => c._type
const classOf = (c) => c._cls
const typeLabel = (c) => (c._type ? `type:${c._type}` : '')
const classLabel = (c) => (c._cls ? `class:${c._cls}` : '')

describe('foldChildren', () => {
    it('packs a large same-type bucket into one folder and keeps the rest', () => {
        const kids = [
            ...Array.from({ length: 6 }, (_, i) => child(`x${i}`, { type: 'T1' })),
            ...Array.from({ length: 4 }, (_, i) => child(`o${i}`, { type: `U${i}` })),
        ]
        const entries = foldChildren(kids, {
            ownerId: 'obj',
            byType: true,
            byClass: false,
            typeAbove: 4,
            clutter: 8,
            typeOf,
            typeLabel,
        })

        expect(entries).toHaveLength(5) // folder + 4 non-packed children
        const folder = entries[0]
        expect(folder.type).toBe('folder')
        expect(folder.kind).toBe('type')
        expect(folder.key).toBe(makeGroupKey('obj', 'type', 'T1'))
        expect(folder.label).toBe('type:T1')
        expect(folder.items).toHaveLength(6)
        expect(entries.slice(1).every((e) => e.type === 'child')).toBe(true)
    })

    it('does not pack when the object has few children in total', () => {
        const kids = Array.from({ length: 6 }, (_, i) => child(`x${i}`, { type: 'T1' }))
        const entries = foldChildren(kids, {
            byType: true,
            byClass: false,
            typeAbove: 4,
            clutter: 8, // 6 not > 8 → nothing packed
            typeOf,
            typeLabel,
        })
        expect(entries.every((e) => e.type === 'child')).toBe(true)
    })

    it('keeps a bucket of exactly the threshold unpacked (must be above it)', () => {
        // 8 same-type children of a 9-child object: not > typeAbove(8) → unpacked.
        const kids = [
            ...Array.from({ length: 8 }, (_, i) => child(`x${i}`, { type: 'T1' })),
            child('y0', { type: 'T9' }),
        ]
        const entries = foldChildren(kids, {
            byType: true,
            byClass: false,
            typeAbove: 8,
            clutter: 8,
            typeOf,
            typeLabel,
        })
        expect(entries.every((e) => e.type === 'child')).toBe(true)
    })

    it('packs many same-class leftovers into a class folder', () => {
        const kids = [
            ...Array.from({ length: 6 }, (_, i) => child(`e${i}`, { type: `T${i}`, cls: 'EVENT' })),
            ...Array.from({ length: 3 }, (_, i) => child(`p${i}`, { type: `P${i}`, cls: HUMAN })),
        ]
        const entries = foldChildren(kids, {
            ownerId: 'obj',
            byType: false,
            byClass: true,
            classAbove: 4,
            clutter: 8,
            excludeClass: [HUMAN],
            classOf,
            classLabel,
        })

        const folder = entries.find((e) => e.type === 'folder')
        expect(folder).toBeTruthy()
        expect(folder.kind).toBe('class')
        expect(folder.category).toBe('EVENT')
        expect(folder.items).toHaveLength(6)
        // the human-class children stay unpacked
        const humans = entries.filter((e) => e.type === 'child')
        expect(humans).toHaveLength(3)
    })
})
