import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import Graph from '@/components/Graph.vue'

const mocks = vi.hoisted(() => ({
    setJsonData: vi.fn().mockResolvedValue(undefined),
    routerPush: vi.fn(),
}))

vi.mock('relation-graph-vue3', () => ({
    default: {
        name: 'RelationGraph',
        props: ['options', 'onNodeClick'],
        methods: { setJsonData: mocks.setJsonData },
        render() { return null },
    },
}))

vi.mock('@/components/Image.vue', () => ({
    default: {
        name: 'Image',
        props: ['nodeId', 'alt', 'width', 'hideWhenNoImage'],
        emits: ['has-image'],
        template: '<div />',
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

const person = (id, extra = {}) => ({
    thing_id: id,
    name: id,
    name_translations: { lang: 'en' },
    class: { thing_id: HUMAN_CLASS, name: 'Human', name_translations: { lang: 'en', ru: 'Человек' } },
    classes: [{ thing_id: HUMAN_CLASS, name: 'Human', name_translations: { lang: 'en', ru: 'Человек' } }],
    links: [],
    ...extra,
})
const linkTo = (id, target, link_name = null, link_type_id = 't-generic') => ({
    link_id: `${id}-l`,
    link_name,
    link_name_translations: null,
    link_type_id,
    target,
})

function mountGraph(object = { thing_id: 'root' }) {
    return mount(Graph, {
        props: { object },
        global: { provide: { getThumbUrl } },
    })
}

describe('Graph', () => {
    beforeEach(() => {
        mocks.setJsonData.mockClear()
        mocks.routerPush.mockClear()
    })

    it('flattens the loaded tree into visible JsonNodes and labelled lines', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: person('root', {
            links: [
                linkTo('father', person('father'), 'father'),
                linkTo('mother', person('mother'), 'mother'),
            ],
        }) } })

        mountGraph()
        await flushPromises()

        expect(axios.get).toHaveBeenCalledWith('/object/root?depth=2')
        expect(mocks.setJsonData).toHaveBeenCalledTimes(1)
        const data = mocks.setJsonData.mock.calls[0][0]
        expect(data.rootId).toBe('root')
        expect(data.nodes.map((n) => n.id)).toEqual(['root', 'father', 'mother'])
        const labels = Object.fromEntries(data.lines.map((l) => [l.to, l.text]))
        expect(labels.father).toBe('father')
        expect(labels.mother).toBe('mother')
    })

    it('never creates a separate node for the class of an object', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: person('root', {
            links: [linkTo('father', person('father'))],
        }) } })

        mountGraph()
        await flushPromises()

        const data = mocks.setJsonData.mock.calls[0][0]
        expect(data.nodes.some((n) => n.id === HUMAN_CLASS)).toBe(false)
    })

    it('marks nodes that carry a loaded subtree as expandable', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: person('root', {
            links: [linkTo('father', person('father', {
                links: [linkTo('grandpa', person('grandpa'))],
            }))],
        }) } })

        mountGraph()
        await flushPromises()

        const data = mocks.setJsonData.mock.calls[0][0]
        const father = data.nodes.find((n) => n.id === 'father')
        const grandpa = data.nodes.find((n) => n.id === 'grandpa')
        expect(father.data._hasChildren).toBe(true)
        expect(grandpa).toBeTruthy() // nothing collapsed by default
    })

    it('collapse hides the loaded subtree of a node and expand brings it back', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: person('root', {
            links: [linkTo('father', person('father', {
                links: [linkTo('grandpa', person('grandpa'))],
            }))],
        }) } })

        const wrapper = mountGraph()
        await flushPromises()

        // Collapse father → grandpa disappears (father node stays).
        wrapper.vm.toggleNode({ id: 'father', data: { _hasChildren: true } })
        await flushPromises()

        let data = mocks.setJsonData.mock.calls.at(-1)[0]
        expect(data.nodes.map((n) => n.id)).toEqual(['root', 'father'])
        expect(data.lines.some((l) => l.to === 'grandpa')).toBe(false)

        // Expand father again → grandpa is back.
        wrapper.vm.toggleNode({ id: 'father', data: { _hasChildren: true } })
        await flushPromises()

        data = mocks.setJsonData.mock.calls.at(-1)[0]
        expect(data.nodes.map((n) => n.id)).toEqual(['root', 'father', 'grandpa'])
    })

    it('opens the clicked node object through the router', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: person('root', {
            links: [linkTo('child', person('child'))],
        }) } })

        const wrapper = mountGraph()
        await flushPromises()

        wrapper.vm.openObject({ id: 'child', text: 'child', data: {} })
        expect(mocks.routerPush).toHaveBeenCalledWith({ name: 'object', params: { uid: 'child' } })
    })

    it('packs many same-type links into a collapsed folder node', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: person('root', {
            links: Array.from({ length: 9 }, (_, i) =>
                linkTo(`ev${i}`, person(`ev${i}`), 'participates in', 'EV')),
        }) } })

        mountGraph()
        await flushPromises()

        const data = mocks.setJsonData.mock.calls[0][0]
        const ids = data.nodes.map((n) => n.id)
        expect(ids.some((id) => id.startsWith('grp:'))).toBe(true)
        expect(ids).not.toContain('ev0') // items are packed by default
        const folder = data.nodes.find((n) => n.id.startsWith('grp:'))
        expect(folder.data._folder).toBe(true)
        expect(folder.data._collapsed).toBe(true)
        expect(folder.data._count).toBe(9)
        expect(folder.width).toBe(44) // small +/− circle, not an object node
        // the relation name moved onto the linking line
        const folderLine = data.lines.find((l) => l.to === folder.id)
        expect(folderLine.text).toBe('participates in · 9')
    })

    it('unfolds a packed folder revealing its items', async () => {
        axios.get.mockResolvedValueOnce({ data: { data: person('root', {
            links: Array.from({ length: 9 }, (_, i) =>
                linkTo(`ev${i}`, person(`ev${i}`), 'participates in', 'EV')),
        }) } })

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
})
