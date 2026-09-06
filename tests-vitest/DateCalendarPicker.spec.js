// tests-vitest/DateCalendarPicker.spec.js
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import DateCalendarPicker from '@/components/Fields/DateCalendarPicker.vue'
import i18n from '@/lang/i18n'

function mountPicker(props = {}) {
    return mount(DateCalendarPicker, {
        global: { plugins: [i18n] },
        props: {
            era: 'gregorian',
            precision: 'day',
            modelValue: { year: 2026, month: 8, day: 11, hour: 12, minute: 30, second: 0 },
            ...props,
        },
    })
}

describe('DateCalendarPicker', () => {
    it('renders the days of the viewed month', () => {
        const wrapper = mountPicker()
        // August 2026 has 31 days.
        expect(wrapper.find('[data-testid="calendar-day-31"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="calendar-day-32"]').exists()).toBe(false)
        // The selected day is highlighted.
        expect(wrapper.find('[data-testid="calendar-day-11"]').classes()).toContain('calendar-selected')
    })

    it('emits the picked date', async () => {
        const wrapper = mountPicker()
        await wrapper.find('[data-testid="calendar-day-15"]').trigger('click')
        const emitted = wrapper.emitted('update:modelValue')
        expect(emitted).toBeTruthy()
        expect(emitted[0][0]).toMatchObject({ year: 2026, month: 8, day: 15 })
    })

    it('accepts a BC (negative) year in the year input', async () => {
        const wrapper = mountPicker()
        const yearInput = wrapper.find('[data-testid="calendar-year"]')
        await yearInput.setValue('-100')
        await yearInput.trigger('change')
        await wrapper.find('[data-testid="calendar-day-1"]').trigger('click')
        const emitted = wrapper.emitted('update:modelValue')
        expect(emitted[emitted.length - 1][0]).toMatchObject({ year: -100, month: 8, day: 1 })
    })

    it('renders era-specific month lengths (hijri even month has 29 days)', () => {
        const wrapper = mountPicker({ era: 'hijri', modelValue: { year: 1446, month: 2, day: 1 } })
        expect(wrapper.find('[data-testid="calendar-day-29"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="calendar-day-30"]').exists()).toBe(false)
    })

    it('shows time inputs for minute precision', () => {
        const wrapper = mountPicker({ precision: 'minute' })
        expect(wrapper.find('[data-testid="calendar-hour"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="calendar-minute"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="calendar-second"]').exists()).toBe(false)
    })
})
