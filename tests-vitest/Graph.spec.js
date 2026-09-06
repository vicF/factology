import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { createPinia } from 'pinia'
import Graph from '@/components/Graph.vue'

const mocks = vi.hoisted(() => ({
    setJsonData: vi.fn().mockResolvedValue(undefined),
    routerPush: vi.fn(),
}))

vi.mock('relation-graph-vue3', () => ({
    default: {
        name: 'RelationGraph',
        props: ['options', 'onLineClick'],
        methods: { setJsonData: mocks.setJsonData },
        render() { return null },
    },
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (k) => k }),
}))

vi.mock('@/lang/i18n', () => ({
    i18n: { global: { locale: 'ru' } },
}))

const getThumbUrl = (id) => `/thumbs/${id}.jpg`
const HUMAN_CLASS = '4c8ee41a-9912-4dff-8b44-7779a66e4fcf'

const person = (id) => ({
    thing_id: id,
    name: id,
    name_translations: { lang: 'en' },
    type: 3,
    class: { thing_id: HUMAN_CLASS, name: 'Human', name_translations: { lang: 'en', ru: 'Человек' } },
    classes: [{ thing_id: HUMAN_CLASS, name: 'Human', name_translations: { lang: 'en', ru: 'Человек' } }],
})
const edge = (one, other, link_name = null, link_type_id = 't-generic') => ({
    link_id: `${one}-${other}-l`,
    one_thing_id: one,
    other_thing_id: other,
    link_type_id,
    link_name,
    link_name_translations: null,
})

function graphPayload(root, nodes, edges) {
    return { data: { data: { root_id: root, nodes, edges } } }
}

function mountGraph(object = { thing_id: 'root' }) {
    return mount(Graph, {
        props: { object },
        global: { provide: { getThumbUrl }, plugins: [createPinia()] },
    })
}

describe('Graph', () => {
    beforeEach(() => {
        mocks.setJsonData.mockClear()
        mocks.routerPush.mockClear()
    })

    it('fetches the full graph endpoint and draws the spanning tree edges', async () => {
        axios.get.mockResolvedValueOnce(graphPayload('root', [
            person('root'),
            person('father'),
            person('mother'),
        ], [
            edge('root', 'father', 'father'),
            edge('root', 'mother', 'mother'),
        ]))

        mountGraph()
        await flushPromises()

        expect(axios.get).toHaveBeenCalledWith('/object/root/graph?depth=2')
        expect(mocks.setJsonData).toHaveBeenCalledTimes(1)
        const data = mocks.setJsonData.mock.calls[0][0]
        expect(data.rootId).toBe('root')
        expect(data.nodes.map((n) => n.id)).toEqual(['root', 'father', 'mother'])
        const toLabel = Object.fromEntries(data.lines.map((l) => [l.to, l.text]))
        expect(toLabel.father).toBe('father')
        expect(toLabel.mother).toBe('mother')
    })

    it('draws cross-links between any two displayed objects', async () => {
        axios.get.mockResolvedValueOnce(graphPayload('root', [
            person('root'),
            person('father'),
            person('mother'),
        ], [
            edge('root', 'father', 'father'),
            edge('root', 'mother', 'mother'),
            edge('father', 'mother', 'married'), // cross-link, not in the tree
        ]))

        mountGraph()
        await flushPromises()

        const data = mocks.setJsonData.mock.calls[0][0]
        const cross = data.lines.find(
            (l) => (l.from === 'father' && l.to === 'mother') || (l.from === 'mother' && l.to === 'father'))
        expect(cross).toBeTruthy()
        expect(cross.text).toBe('married')
    })

    it('never creates a separate node for the class of an object', async () => {
        axios.get.mockResolvedValueOnce(graphPayload('root', [
            person('root'),
            person('father'),
        ], [edge('root', 'father')]))

        mountGraph()
        await flushPromises()

        const data = mocks.setJsonData.mock.calls[0][0]
        expect(data.nodes.some((n) => n.id === HUMAN_CLASS)).toBe(false)
    })

    it('packs many same-type links into a collapsed small folder', async () => {
        const events = Array.from({ length: 9 }, (_, i) => person(`ev${i}`))
        const edges = events.map((e) => edge('root', e.thing_id, 'participates in', 'EV'))
        axios.get.mockResolvedValueOnce(graphPayload('root', [person('root'), ...events], edges))

        mountGraph()
        await flushPromises()

        const data = mocks.setJsonData.mock.calls[0][0]
        const ids = data.nodes.map((n) => n.id)
        expect(ids.some((id) => id.startsWith('grp:'))).toBe(true)
        expect(ids).not.toContain('ev0') // packed by default
        const folder = data.nodes.find((n) => n.id.startsWith('grp:'))
        expect(folder.data._folder).toBe(true)
        expect(folder.data._collapsed).toBe(true)
        expect(folder.width).toBe(44)
        const folderLine = data.lines.find((l) => l.to === folder.id)
        expect(folderLine.text).toBe('participates in · 9')
    })

    it('unfolds a packed folder revealing its items', async () => {
        const events = Array.from({ length: 9 }, (_, i) => person(`ev${i}`))
        const edges = events.map((e) => edge('root', e.thing_id, 'participates in', 'EV'))
        axios.get.mockResolvedValueOnce(graphPayload('root', [person('root'), ...events], edges))

        const wrapper = mountGraph()
        await flushPromises()

        let data = mocks.setJsonData.mock.calls[0][0]
        const folder = data.nodes.find((n) => n.id.startsWith('grp:'))

        wrapper.vm.toggleNode(folder)
        await flushPromises()

        data = mocks.setJsonData.mock.calls.at(-1)[0]
        expect(data.nodes.map((n) => n.id)).toContain('ev0')
        const openFolder = data.nodes.find((n) => n.id.startsWith('grp:'))
        expect(openFolder.data._collapsed).toBe(false)
    })

    it('opens the clicked node object through the router', async () => {
        axios.get.mockResolvedValueOnce(graphPayload('root', [
            person('root'),
            person('child'),
        ], [edge('root', 'child')]))

        const wrapper = mountGraph()
        await flushPromises()

        wrapper.vm.openObject({ id: 'child', text: 'child', data: {} })
        expect(mocks.routerPush).toHaveBeenCalledWith({ name: 'object', params: { uid: 'child' } })
    })
})
