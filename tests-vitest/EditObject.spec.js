import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import EditObject from '@/components/EditObject.vue'
import axios from 'axios'

// A functional event bus so tests can drive the "create new object via modal" flow
// that LinkedObject kicks off with `eventBus.emit('open-create-modal', ...)`.
const { busHandlers, eventBusMock } = vi.hoisted(() => {
    const busHandlers = {}
    const eventBusMock = {
        on: vi.fn((event, handler) => {
            (busHandlers[event] = busHandlers[event] || []).push(handler)
        }),
        off: vi.fn((event, handler) => {
            if (busHandlers[event]) {
                busHandlers[event] = busHandlers[event].filter(h => h !== handler)
            }
        }),
        emit: vi.fn((event, data) => {
            ;(busHandlers[event] || []).forEach(h => h(data))
        }),
    }
    return { busHandlers, eventBusMock }
})

vi.mock('@/eventBus', () => ({ eventBus: eventBusMock }))

vi.mock('bootstrap', () => ({
    Modal: class {
        constructor() {}
        show() {}
        hide() {}
    },
}))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn(), currentRoute: { value: {} } }),
}))

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: key => key }),
}))

vi.mock('@/stores/objects', () => ({
    useObjectsStore: () => ({
        moveClassInTree: vi.fn(),
        updateClassInTree: vi.fn(),
        addClassToTree: vi.fn(),
    }),
}))

const EDIT_ID = 'existing-object-id'
const NEW_OBJECT_ID = 'brand-new-object-id'
const DEFAULT_LINK_TYPE = '4b27fd0c-d8be-425c-a529-2186b2589e76'
const OBJECT = { thing_id: EDIT_ID, name: 'Existing Object', type: 3 }

// The whole modal is teleported to <body>, so query the rendered DOM directly.
const mainForm = () => document.querySelector('form')
// Exclude icon-only buttons (ObjectField's chevron/clear toggles) — we only care about the action rows.
const formButtons = () => [...mainForm().querySelectorAll('button')].filter(b => b.textContent.trim() !== '')

const clickButton = (text) => {
    const btn = formButtons().find(b => b.textContent.trim() === text)
    expect(btn, `button "${text}" not found`).toBeTruthy()
    btn.click()
}

const submitForm = () => {
    mainForm().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

let wrapper

const mountEditObject = async (props = {}) => {
    wrapper = mount(EditObject, {
        props: { params: { type: 3 }, ...props },
        global: {
            stubs: { RouterLink: true },
            mocks: { $t: key => key },
        },
    })
    await nextTick()
    return wrapper
}

beforeEach(() => {
    Object.keys(busHandlers).forEach(k => delete busHandlers[k])
    vi.clearAllMocks()
    axios.put.mockResolvedValue({ data: {} })
    axios.post.mockResolvedValue({ data: {} })
})

afterEach(() => {
    wrapper?.unmount()
    document.body.innerHTML = ''
})

describe('EditObject', () => {
    it('renders a single action row when there are no links', async () => {
        await mountEditObject()

        expect(document.querySelectorAll('.linked-object').length).toBe(0)
        expect(formButtons().map(b => b.textContent.trim())).toEqual([
            'Add Link',
            'Add External Link',
            'Close',
            'Save',
        ])
    })

    it('duplicates the action row once a link is added', async () => {
        await mountEditObject()

        clickButton('Add Link')
        await nextTick()

        expect(document.querySelectorAll('.linked-object').length).toBe(1)
        expect(formButtons().filter(b => b.textContent.trim() === 'Save').length).toBe(2)
        expect(formButtons().filter(b => b.textContent.trim() === 'Add Link').length).toBe(2)
    })

    it('fills a link with a newly created object instead of an existing one', async () => {
        await mountEditObject({ object: OBJECT })

        // The user adds a link...
        clickButton('Add Link')
        await nextTick()

        // ...and clicks "Create" in the new link row instead of picking an object.
        const createButton = [...document.querySelectorAll('.linked-object .flex-button')]
            .find(b => b.textContent.includes('Create'))
        expect(createButton).toBeTruthy()
        createButton.click()
        await nextTick()

        // Opening the create modal must NOT submit the edit form.
        expect(axios.put).not.toHaveBeenCalled()
        expect(axios.post).not.toHaveBeenCalled()

        // The app opens the "create object" modal with a link-created callback.
        const openCalls = eventBusMock.emit.mock.calls.filter(c => c[0] === 'open-create-modal')
        expect(openCalls.length).toBe(1)
        const payload = openCalls[0][1]
        expect(payload.callback.type).toBe('link-created')
        expect(payload.callback.index).toBe(0)

        // Simulate saving the brand-new object inside that modal.
        eventBusMock.emit('link-created', {
            requestId: payload.callback.requestId,
            newObjectId: NEW_OBJECT_ID,
            newObjectName: 'Brand New Object',
            index: 0,
            linkTypeUuid: payload.callback.linkTypeUuid,
            comment: '',
        })
        await flushPromises()

        // The link's "second object" field now points at the new object.
        const otherThingInput = document.querySelector('.linked-object input[name="other_thing"]')
        expect(otherThingInput.value).toBe(NEW_OBJECT_ID)

        // Saving the object carries the new link in links_to_add.
        submitForm()
        await flushPromises()

        expect(axios.put).toHaveBeenCalledTimes(1)
        const [url, body] = axios.put.mock.calls[0]
        expect(url).toBe(`/object/${EDIT_ID}`)
        expect(body.links_to_add).toEqual([
            {
                one_thing_id: EDIT_ID,
                link_type_id: DEFAULT_LINK_TYPE,
                other_thing_id: NEW_OBJECT_ID,
                description: '',
                public: 0,
            },
        ])
    })

    it('saves external links added in the form', async () => {
        await mountEditObject({ object: OBJECT })

        clickButton('Add External Link')
        await nextTick()

        const urlInput = mainForm().querySelector('input[type="url"]')
        expect(urlInput).toBeTruthy()
        urlInput.value = 'https://en.wikipedia.org/wiki/Vodka'
        urlInput.dispatchEvent(new Event('input'))
        await nextTick()

        submitForm()
        await flushPromises()

        expect(axios.put).toHaveBeenCalledTimes(1)
        const [url, body] = axios.put.mock.calls[0]
        expect(url).toBe(`/object/${EDIT_ID}`)
        expect(body.external_links).toEqual([{ url: 'https://en.wikipedia.org/wiki/Vodka' }])
    })

    it('pre-fills external links when editing an object', async () => {
        await mountEditObject({
            object: {
                ...OBJECT,
                external_links: [{ id: 'el-1', url: 'https://vk.com/foo' }],
            },
        })

        const urlInputs = [...mainForm().querySelectorAll('input[type="url"]')]
        expect(urlInputs.length).toBe(1)
        expect(urlInputs[0].value).toBe('https://vk.com/foo')
        // Existing external links also show the duplicated action row.
        expect(formButtons().filter(b => b.textContent.trim() === 'Update').length).toBe(2)
    })

    it('focuses the new URL input when an external link is added', async () => {
        await mountEditObject()

        clickButton('Add External Link')
        await flushPromises()

        expect(document.activeElement).toBe(mainForm().querySelector('input[type="url"]'))
    })
})
