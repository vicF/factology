import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import Graph from '@/components/Graph.vue'

const mocks = vi.hoisted(() => ({
    setJsonData: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('relation-graph-vue3', () => ({
    default: {
        name: 'RelationGraph',
        props: ['options', 'onNodeClick', 'onLineClick'],
        methods: { setJsonData: mocks.setJsonData },
        render() { return null },
    },
}))

vi.mock('@/components/Image.vue', () => ({
    default: {
        name: 'Image',
        props: ['nodeId', 'alt', 'hideWhenNoImage'],
        emits: ['has-image'],
        template: '<div />',
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

const getThumbUrl = (id) => `/thumbs/${id}.jpg`

function mountGraph(object = { thing_id: 'root' }) {
    return mount(Graph, {
        props: { object },
        global: { provide: { getThumbUrl } },
    })
}

describe('Graph', () => {
    beforeEach(() => {
        mocks.setJsonData.mockClear()
    })

    it('renders link names translated into the current locale', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: {
                thing_id: 'root',
                name: 'Root',
                name_translations: { lang: 'en' },
                links: [{
                    link_id: 'l1',
                    link_name: 'sibling',
                    link_name_translations: { lang: 'en', ru: 'сиблинг' },
                    target: {
                        thing_id: 'child1',
                        name: 'Child',
                        name_translations: { lang: 'en' },
                        links: [],
                    },
                }],
            } },
        })

        mountGraph()
        await flushPromises()

        expect(axios.get).toHaveBeenCalledWith('/object/root?depth=2')
        expect(mocks.setJsonData).toHaveBeenCalledTimes(1)
        const data = mocks.setJsonData.mock.calls[0][0]
        const line = data.lines.find((l) => l.id === 'l1')
        expect(line.text).toBe('сиблинг')
    })

    it('falls back to the generic "connected" label when a link has no name', async () => {
        axios.get.mockResolvedValueOnce({
            data: { data: {
                thing_id: 'root',
                name: 'Root',
                name_translations: { lang: 'en' },
                links: [{
                    link_id: 'l2',
                    link_name: null,
                    link_name_translations: null,
                    target: {
                        thing_id: 'child2',
                        name: 'Child2',
                        name_translations: { lang: 'en' },
                        links: [],
                    },
                }],
            } },
        })

        mountGraph()
        await flushPromises()

        const data = mocks.setJsonData.mock.calls[0][0]
        const line = data.lines.find((l) => l.id === 'l2')
        expect(line.text).toBe('connected')
    })
})
