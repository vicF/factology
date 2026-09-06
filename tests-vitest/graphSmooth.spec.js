import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { createPinia } from 'pinia'
import Graph from '@/components/Graph.vue'

// ---------------------------------------------------------------------------
// Same component, but with a fake relation-graph that supports the incremental
// API (addNodes/addLines/removeNodeById/...) so tests exercise the exact code
// path the real browser uses for toggles and depth switches.
// ---------------------------------------------------------------------------

const fullData = vi.hoisted(() => ({
    setJsonDataCalls: [],
}))

const makeInstance = () => ({
    nodes: new Map(),
    lines: new Map(),
    root: null,
    addNodes(ns) {
        for (const n of ns) this.nodes.set(n.id, { ...n, x: 1, y: 1 })
    },
    addLines(ls) {
        for (const l of ls) this.lines.set(l.id, l)
    },
    removeNodeById(id) {
        this.nodes.delete(id)
        for (const [key, l] of [...this.lines]) {
            if (l.from === id || l.to === id) this.lines.delete(key)
        }
    },
    removeLineById(id) {
        this.lines.delete(id)
    },
    getNodeById(id) {
        return this.nodes.get(id) ?? null
    },
    setNodePosition(n, x, y) {
        if (n) { n.x = x; n.y = y }
    },
    getNodes() {
        return [...this.nodes.values()]
    },
    setRootNodeId(id) {
        this.root = id
    },
    async doLayout() {},
    async playShowEffect() {},
})

vi.mock('relation-graph-vue3', () => ({
    default: {
        name: 'RelationGraph',
        props: ['options', 'onLineClick'],
        methods: {
            setJsonData(payload) {
                fullData.setJsonDataCalls.push(payload)
                const inst = fullData.instance
                inst.nodes = new Map(payload.nodes.map((n) => [n.id, { ...n, x: 1, y: 1 }]))
                inst.lines = new Map(payload.lines.map((l) => [l.id, l]))
                inst.root = payload.rootId
                return Promise.resolve()
            },
            getInstance() {
                return fullData.instance
            },
        },
        render() { return null },
    },
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (k) => k }),
}))

vi.mock('@/lang/i18n', () => ({
    i18n: { global: { locale: 'ru' } },
}))

const getThumbUrl = () => ''
const p = (id, name) => ({
    thing_id: id,
    name,
    name_translations: { lang: 'en' },
    type: 3,
    class: null,
    classes: [],
})
const edge = (one, other, link_name = null, link_type_id = 't-generic') => ({
    link_id: `${one}-${other}-l`,
    one_thing_id: one,
    other_thing_id: other,
    link_type_id,
    link_name,
    link_name_translations: null,
})
const payload = (root, nodes, edges) => ({ data: { data: { root_id: root, nodes, edges } } })

const WED = 'fc6bef17-54fb-4421-80c4-012228f3b033'
const VICTOR = '8c879e2f-1352-4690-932f-1215cdbe31a9'
const OLGA = 'b25ee50f-5afd-4135-9ba8-dd695d9079e8'
const TREE = 'b501bc9d-2421-439c-8c36-a74f9b14538c'
const SPB = '4f398735-588a-4620-a3b2-8e50569e7d19'
const BIRTH = 'birth-child-1'

const DIRECT = [VICTOR, OLGA, TREE, SPB]

function mountGraph(object = { thing_id: WED }) {
    fullData.instance = makeInstance()
    fullData.setJsonDataCalls = []
    return mount(Graph, { props: { object }, global: { provide: { getThumbUrl }, plugins: [createPinia()] } })
}

describe('Graph incremental depth switch', () => {
    beforeEach(() => {
        fullData.instance = makeInstance()
        fullData.setJsonDataCalls = []
    })

    it('keeps every direct link when lowering depth 2 → 1', async () => {
        axios.get
            .mockResolvedValueOnce(payload(WED, [
                p(WED, 'Marriage'), p(VICTOR, 'Victor'), p(OLGA, 'Olga'),
                p(TREE, 'Tree'), p(SPB, 'SPb'), p(BIRTH, 'Birth'),
            ], [
                edge(WED, VICTOR, 'participates in'),
                edge(WED, OLGA, 'participates in'),
                edge(WED, TREE, 'archived in'),
                edge(WED, SPB, 'inside'),
                edge(VICTOR, BIRTH, 'birth'),
                edge(VICTOR, OLGA, 'married'),
            ]))
            .mockResolvedValueOnce(payload(WED, [
                p(WED, 'Marriage'), p(VICTOR, 'Victor'), p(OLGA, 'Olga'),
                p(TREE, 'Tree'), p(SPB, 'SPb'),
            ], [
                edge(WED, VICTOR, 'participates in'),
                edge(WED, OLGA, 'participates in'),
                edge(WED, TREE, 'archived in'),
                edge(WED, SPB, 'inside'),
                edge(VICTOR, OLGA, 'married'),
            ]))

        const wrapper = mountGraph()
        await flushPromises()
        expect(fullData.setJsonDataCalls).toHaveLength(1)

        const levelOne = wrapper.findAll('.graph-hud-head button').find((b) => b.text().trim() === '1')
        expect(levelOne).toBeTruthy()
        await levelOne.trigger('click')
        await flushPromises()

        expect(axios.get).toHaveBeenLastCalledWith(`/object/${WED}/graph?depth=1`)
        const inst = fullData.instance
        expect(inst.nodes.size).toBe(5)
        for (const id of [WED, ...DIRECT]) {
            expect(inst.nodes.has(id)).toBe(true)
        }
        expect(inst.nodes.has(BIRTH)).toBe(false)
        // Root → every direct neighbour must have a line.
        for (const n of DIRECT) {
            const key = `${WED}→${n}`
            expect(inst.lines.has(key), `missing spanning line ${key}`).toBe(true)
        }
        // Wedding participants cross-link must survive the switch too.
        const married = edge(VICTOR, OLGA, 'married')
        expect(inst.lines.has(`x:${married.link_id}`)).toBe(true)
    })
})
