// tests-vitest/EditObject.spec.js
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import EditObject from '@/components/EditObject.vue'
import axios from 'axios'
import i18n from '@/lang/i18n'

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

// The merged component imports the real i18n module transitively (via
// utils/localized.js), which calls createI18n — the mock must provide it so
// the module loads, while useI18n keeps the form's t() trivial.
vi.mock('vue-i18n', () => {
    const composer = {
        locale: { value: 'en' },
        t: (key) => key,
    }
    return {
        createI18n: () => ({
            global: composer,
            install: (app) => { app.config.globalProperties.$t = composer.t },
        }),
        useI18n: () => ({ t: (key) => key }),
    }
})

vi.mock('@/stores/objects', () => ({
    useObjectsStore: () => ({
        moveClassInTree: vi.fn(),
        updateClassInTree: vi.fn(),
        addClassToTree: vi.fn(),
    }),
}))

const authState = vi.hoisted(() => ({ user: null }))
vi.mock('@/stores/auth', () => ({
    useAuthStore: () => ({ user: authState.user, authenticated: false }),
}))

// Deterministic language catalog so the translations UI state is stable.
vi.mock('../resources/js/localization/languageCatalog.js', () => ({
    loadLanguages: vi.fn(async () => [
        { code: 'en', name: 'English' },
        { code: 'ru', name: 'Русский' },
    ]),
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
    authState.user = null
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
            'Add',
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

    // ── Owner (system ownership) — admins only ──

    it('hides the Owner select for non-admins', async () => {
        await mountEditObject({ object: OBJECT })

        expect(document.querySelector('#ownerSelect')).toBeNull()
    })

    it('shows the Owner select for admins and sends owner in the payload', async () => {
        authState.user = { is_admin: true }
        await mountEditObject({ object: OBJECT })

        const ownerSelect = document.querySelector('#ownerSelect')
        expect(ownerSelect).toBeTruthy()

        // The "System Owner" reserved option is always offered.
        const values = [...ownerSelect.options].map(o => o.value)
        expect(values).toContain('aaaaaaaa-0000-4000-a000-00000000000a')

        ownerSelect.value = 'aaaaaaaa-0000-4000-a000-00000000000a'
        ownerSelect.dispatchEvent(new Event('change'))
        await nextTick()

        submitForm()
        await flushPromises()

        expect(axios.put).toHaveBeenCalledTimes(1)
        const [, body] = axios.put.mock.calls[0]
        expect(body.owner).toBe('aaaaaaaa-0000-4000-a000-00000000000a')
    })
})

// ── Localization: field language attribute ──────────────────────────────

// Object with source language 'en' and a Russian translation — same shape as
// the Ленинградский object the user tests with in the live app.
const ruObject = {
    thing_id: '111',
    name: "Leningrad Rock'n'Roll in Central Park of Culture and Leisure",
    description: 'A festival description',
    name_translations: { lang: 'en', ru: 'Ленинградский Рок-н-Ролл в ЦПКО' },
    description_translations: { lang: 'en', ru: 'Описание фестиваля' },
    data: { properties: {} },
    type: 3,
    public: 0,
}

async function mountEditor(object = ruObject) {
    const wrapper = mount(EditObject, {
        props: { object },
        global: {
            plugins: [i18n],
            stubs: { Teleport: true, LinkedObject: true, DateField: true, ErrorModal: true },
        },
    })
    await flushPromises() // let onMounted's loadLanguages resolve
    await wrapper.vm.$nextTick()
    return wrapper
}

describe('EditObject field language attribute', () => {
    it('edits the plain value and shows its declared language', async () => {
        const wrapper = await mountEditor()
        expect(wrapper.vm.nameSourceLang).toBe('en')
        expect(wrapper.find('input[name="name"]').element.value).toBe(
            "Leningrad Rock'n'Roll in Central Park of Culture and Leisure"
        )
        expect(wrapper.find('.field-lang-badge').text()).toBe('EN')
    })

    it('reveals the language selector on hover', async () => {
        const wrapper = await mountEditor()
        expect(wrapper.find('select.field-lang-select').exists()).toBe(false)
        wrapper.vm.showNameLang = true
        await wrapper.vm.$nextTick()
        expect(wrapper.find('select.field-lang-select').exists()).toBe(true)
    })

    it('changing the field language keeps the text and only re-tags the payload', async () => {
        const wrapper = await mountEditor()
        wrapper.vm.switchFieldLanguage('name', 'de')
        await wrapper.vm.$nextTick()

        // Text is untouched
        expect(wrapper.find('input[name="name"]').element.value).toBe(
            "Leningrad Rock'n'Roll in Central Park of Culture and Leisure"
        )
        expect(wrapper.vm.nameSourceLang).toBe('de')

        const payload = wrapper.vm.buildFieldPayload('name')
        expect(payload.plain).toBe("Leningrad Rock'n'Roll in Central Park of Culture and Leisure")
        expect(payload.translations).toEqual({ lang: 'de', ru: 'Ленинградский Рок-н-Ролл в ЦПКО' })
    })

    it('promotes an existing translation when switching to its language', async () => {
        const wrapper = await mountEditor()
        wrapper.vm.switchFieldLanguage('name', 'ru')
        await wrapper.vm.$nextTick()

        expect(wrapper.vm.nameSourceLang).toBe('ru')
        expect(wrapper.find('input[name="name"]').element.value).toBe('Ленинградский Рок-н-Ролл в ЦПКО')

        const payload = wrapper.vm.buildFieldPayload('name')
        expect(payload.plain).toBe('Ленинградский Рок-н-Ролл в ЦПКО')
        expect(payload.translations).toEqual({ lang: 'ru', en: "Leningrad Rock'n'Roll in Central Park of Culture and Leisure" })
    })

    it('switches the field language via the hover selector', async () => {
        const wrapper = await mountEditor()
        wrapper.vm.showNameLang = true
        await wrapper.vm.$nextTick()
        await wrapper.find('select.field-lang-select').setValue('ru')
        await wrapper.vm.$nextTick()

        expect(wrapper.vm.nameSourceLang).toBe('ru')
        expect(wrapper.find('input[name="name"]').element.value).toBe('Ленинградский Рок-н-Ролл в ЦПКО')
    })

    it('the payload always carries the declared language', async () => {
        const wrapper = await mountEditor()
        const payload = wrapper.vm.buildFieldPayload('name')
        expect(payload.translations.lang).toBe('en')
        const descPayload = wrapper.vm.buildFieldPayload('description')
        expect(descPayload.translations.lang).toBe('en')
    })

    it('description field has its own independent language', async () => {
        const wrapper = await mountEditor()
        expect(wrapper.vm.descriptionSourceLang).toBe('en')
        expect(wrapper.find('input[name="description"]').element.value).toBe('A festival description')

        wrapper.vm.switchFieldLanguage('description', 'ru')
        await wrapper.vm.$nextTick()
        expect(wrapper.find('input[name="description"]').element.value).toBe('Описание фестиваля')

        const payload = wrapper.vm.buildFieldPayload('description')
        expect(payload.plain).toBe('Описание фестиваля')
        expect(payload.translations).toEqual({ lang: 'ru', en: 'A festival description' })
    })
})
