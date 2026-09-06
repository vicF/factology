// tests-vitest/FlexibleDateField.spec.js
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, it, expect } from 'vitest'
import FlexibleDateField from '@/components/Fields/FlexibleDateField.vue'
import i18n from '@/lang/i18n'

function lastEmit(wrapper) {
    const events = wrapper.emitted('update:value')
    return events ? events[events.length - 1][0] : null
}

function setInput(wrapper, value) {
    const input = wrapper.find('input[name]')
    input.element.value = value
    input.trigger('input')
}

describe('FlexibleDateField', () => {
    it('view mode renders a localized flexible date', () => {
        const wrapper = mount(FlexibleDateField, {
            global: { plugins: [i18n] },
            props: {
                isEditable: false,
                side: 'start',
                start: '16500101000000',
                startMeta: { qualifier: 'approx', precision: 'year', era: 'gregorian' },
            },
        })
        // Locale defaults to 'en' in the test environment.
        expect(wrapper.text()).toContain('circa 1650')
    })

    it('view mode shows a between range from both bounds', () => {
        const wrapper = mount(FlexibleDateField, {
            global: { plugins: [i18n] },
            props: {
                isEditable: false,
                side: 'start',
                start: '15000101000000',
                end: '16000101000000',
                startMeta: { qualifier: 'between', precision: 'year', era: 'gregorian' },
            },
        })
        expect(wrapper.text()).toContain('between 1500 and 1600')
    })

    it('parses a free-text approx expression and emits canonical bounds', () => {
        const wrapper = mount(FlexibleDateField, {
            global: { plugins: [i18n] },
            props: { isEditable: true, side: 'start' },
        })
        setInput(wrapper, 'около 1650')

        const payload = lastEmit(wrapper)
        expect(payload.start).toBe('16500101000000')
        expect(payload.meta.qualifier).toBe('approx')
        expect(payload.meta.precision).toBe('year')
    })

    it('parses a between expression into both bounds', () => {
        const wrapper = mount(FlexibleDateField, {
            global: { plugins: [i18n] },
            props: { isEditable: true, side: 'start' },
        })
        setInput(wrapper, 'between 1500 and 1600')

        const payload = lastEmit(wrapper)
        expect(payload.start).toBe('15000101000000')
        expect(payload.end).toBe('16000101000000')
        expect(payload.meta.qualifier).toBe('between')
    })

    it('structured qualifier select overrides a plain date', () => {
        const wrapper = mount(FlexibleDateField, {
            global: { plugins: [i18n] },
            props: { isEditable: true, side: 'start' },
        })
        setInput(wrapper, '1650')
        const select = wrapper.find('select')
        select.element.value = 'approx'
        select.trigger('change')

        const payload = lastEmit(wrapper)
        expect(payload.start).toBe('16500101000000')
        expect(payload.meta.qualifier).toBe('approx')
    })

    it('before qualifier writes the bound to the end column on the start side', () => {
        const wrapper = mount(FlexibleDateField, {
            global: { plugins: [i18n] },
            props: { isEditable: true, side: 'start' },
        })
        setInput(wrapper, 'before 1500')

        const payload = lastEmit(wrapper)
        expect(payload.start).toBeNull()
        expect(payload.end).toBe('15000101000000')
        expect(payload.meta.qualifier).toBe('before')
    })

    it('does NOT infer "between" for a legacy start+end pair without meta', async () => {
        // Old objects store a plain exact range in start/end with no meta.
        // "between" (uncertainty) is a new concept; it must not be assumed.
        const wrapper = mount(FlexibleDateField, {
            global: { plugins: [i18n] },
            props: {
                isEditable: true,
                side: 'start',
                start: '2026081112',
                end: '2026081122',
                startMeta: null,
                endMeta: null,
            },
        })

        await nextTick()
        const qualifier = wrapper.find('select').element.value
        expect(qualifier).toBe('exact')
        // The preview must echo a plain exact bound, not a "between" range.
        expect(wrapper.find('code').text()).not.toContain('between')
        expect(wrapper.find('code').text()).toContain('2026-08-11')
    })

    it('infers minute precision from a legacy value that stores hours', async () => {
        // start='2026081112' is 2026-08-11 12:00. Without meta the field must
        // infer minute precision instead of defaulting to day, so the minutes
        // are not dropped from the preview/format.
        const wrapper = mount(FlexibleDateField, {
            global: { plugins: [i18n] },
            props: {
                isEditable: true,
                side: 'start',
                start: '2026081112',
                end: '2026081122',
                startMeta: null,
                endMeta: null,
            },
        })
        await nextTick()

        const selects = wrapper.findAll('select')
        // Structured controls order: qualifier, era, precision.
        expect(selects[2].element.value).toBe('minute')
        expect(wrapper.find('code').text()).toContain('12:00')
        expect(wrapper.find('code').text()).toContain('2026-08-11')
    })

    it('toggles the format-help box via the ? button', async () => {
        const wrapper = mount(FlexibleDateField, {
            global: { plugins: [i18n] },
            props: { isEditable: true, side: 'start' },
        })
        await nextTick()

        const helpButton = wrapper.findAll('button').find(b => b.text().trim() === '?')
        expect(helpButton).toBeTruthy()
        expect(wrapper.find('.flexible-date-help').exists()).toBe(false)

        await helpButton.trigger('click')
        expect(wrapper.find('.flexible-date-help').exists()).toBe(true)

        await helpButton.trigger('click')
        expect(wrapper.find('.flexible-date-help').exists()).toBe(false)
    })

    it('inserts today and emits its canonical value via the clock button', async () => {
        const wrapper = mount(FlexibleDateField, {
            global: { plugins: [i18n] },
            props: { isEditable: true, side: 'start' },
        })
        await nextTick()

        const nowButton = wrapper.findAll('button').find(b => b.text().trim() === '🕒')
        expect(nowButton).toBeTruthy()
        await nowButton.trigger('click')

        const payload = lastEmit(wrapper)
        expect(payload).not.toBeNull()
        // Today parses to a canonical YYYYMMDDHHMMSS string for the current date.
        const now = new Date()
        const pad = (n) => String(n).padStart(2, '0')
        const expectStart = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + pad(now.getHours()) + pad(now.getMinutes()) + '00'
        expect(payload.start).toBe(expectStart)
        expect(payload.meta.precision).toBe('minute')
    })
})
