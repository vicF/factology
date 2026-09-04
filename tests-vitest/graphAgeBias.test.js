import { describe, it, expect } from 'vitest'
import { dateKeyOf, applyAgeBias } from '@/utils/graphAgeBias'
import { UUID } from '@/constants/uuid'

const HUMAN = '4c8ee41a-9912-4dff-8b44-7779a66e4fcf'
const node = (id, start, extra = {}) => ({
    id,
    x: extra.x ?? 0,
    y: extra.y ?? 0,
    data: {
        thing_id: id,
        name: id,
        start,
        classes: [{ thing_id: HUMAN, name: 'Human' }],
        ...extra.data,
    },
})
const link = (from, to, type) => ({ from, to, linkType: type })

describe('dateKeyOf', () => {
    it('reads the canonical start and treats empty/null as unknown', () => {
        expect(dateKeyOf(node('a', '18970101000000'))).toBe('18970101000000')
        expect(dateKeyOf(node('a', null))).toBe(null)
        expect(dateKeyOf(node('a', ''))).toBe(null)
        expect(dateKeyOf({ data: { link_start: '19500101000000' } })).toBe('19500101000000')
    })
})

describe('applyAgeBias', () => {
    it('shifts older objects above younger ones within the auto layout', () => {
        const nodes = [node('dad', '19500101000000'), node('kid', '19900101000000')]
        nodes[0].y = 100
        nodes[1].y = 100 // library would place both on one line

        applyAgeBias(nodes, [])

        const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
        expect(byId.dad.y).toBeLessThan(byId.kid.y)
    })

    it('puts the parent above the child even when the auto layout reversed them', () => {
        const nodes = [node('dad', '19500101000000'), node('kid', '19800101000000')]
        nodes[0].y = 100 // dad below...
        nodes[1].y = -50 // ...kid above (auto layout "wrong" side)

        applyAgeBias(nodes, [link('dad', 'kid', UUID.FATHER)])

        const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
        expect(byId.dad.y).toBeLessThan(byId.kid.y)
    })

    it('treats the older endpoint of a reversed stored link as the parent', () => {
        const nodes = [node('dad', '19500101000000'), node('kid', '19800101000000')]
        nodes[0].y = 50
        nodes[1].y = -60

        // Stored child→parent direction: FATHER link recorded from kid to dad.
        applyAgeBias(nodes, [link('kid', 'dad', UUID.MOTHER)])

        const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
        expect(byId.dad.y).toBeLessThan(byId.kid.y)
    })

    it('leaves undated nodes alone but never promotes them above dated children', () => {
        const nodes = [node('dated', '19800101000000'), node('unknown', null)]
        nodes[0].y = 10
        nodes[1].y = 0

        applyAgeBias(nodes, [])

        const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
        expect(byId.unknown.y).toBe(0) // undated → untouched
    })
})
