// tests-vitest/EditObject.spec.js
import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import EditObject from '@/components/EditObject.vue'
import i18n from '@/lang/i18n'

vi.mock('axios')
vi.mock('bootstrap', () => ({ Modal: class { constructor() {} show() {} hide() {} } }))
vi.mock('vue-router', () => ({ useRouter: () => ({}) }))
vi.mock('@/stores/objects', () => ({
    useObjectsStore: () => ({ moveClassInTree: vi.fn(), updateClassInTree: vi.fn(), addClassToTree: vi.fn() }),
}))
vi.mock('@/stores/objectCache', () => ({
    useObjectCacheStore: () => ({ hasCachedObject: () => false, cacheObject: vi.fn() }),
}))
vi.mock('../resources/js/localization/languageCatalog.js', () => ({
    loadLanguages: vi.fn(async () => [
        { code: 'en', name: 'English' },
        { code: 'ru', name: 'Русский' },
    ]),
}))
vi.mock('../resources/js/eventBus.js', () => ({ eventBus: { emit: vi.fn() } }))

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
