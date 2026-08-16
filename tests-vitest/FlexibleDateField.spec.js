// tests-vitest/FlexibleDateField.spec.js
import { mount } from '@vue/test-utils'
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
})
