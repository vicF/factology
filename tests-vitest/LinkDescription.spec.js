// tests-vitest/LinkDescription.spec.js
// Regression: the API exposes both endpoint names (link.name = other_thing_id,
// link.one_name = one_thing_id). For an INCOMING link (the current object is
// other_thing_id) the one endpoint must resolve from one_name — before the fix
// it fell back to link.name (the current object's own name), producing
// self-referential text like "Поездка участвует в Поездка".
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import LinkDescription from '@/components/LinkDescription.vue'

const linkType = { one_thing_id: 't', other_thing_id: 'u', link_type_id: 'lt', link_name: 'is involved in' }

function textOf(wrapper) {
    return wrapper.text().replace(/\s+/g, ' ').trim()
}

describe('LinkDescription', () => {
    it('renders an outgoing link (current object is one) with distinct endpoints', () => {
        const link = { ...linkType, one_thing_id: 'current', other_thing_id: 'other', name: 'Other Object', one_name: 'Current Object' }
        const object = { thing_id: 'current', name: 'Current Object' }
        const wrapper = mount(LinkDescription, { props: { link, object } })
        const text = textOf(wrapper)
        expect(text).toContain('Current Object')
        expect(text).toContain('Other Object')
        expect(text).toContain('is involved in')
        // The two endpoints must not be the same name.
        expect(text.indexOf('Current Object')).not.toBe(text.lastIndexOf('Other Object'))
    })

    it('renders an incoming link (current object is other) using one_name for the one endpoint', () => {
        // The current object is other_thing_id; the one endpoint (Виктор) is the target.
        const link = { ...linkType, one_thing_id: 'one', other_thing_id: 'current', name: 'Current Object', one_name: 'Victor' }
        const object = { thing_id: 'current', name: 'Current Object' }
        const wrapper = mount(LinkDescription, { props: { link, object } })
        const text = textOf(wrapper)
        // Before the fix the one endpoint fell back to link.name ("Current Object"),
        // producing "Current Object — is involved in — Current Object".
        expect(text).toContain('Victor')
        expect(text).toContain('Current Object')
        expect(text).not.toContain('Current Object — is involved in — Current Object')
    })

    it('resolves the one endpoint from target.name when one_name is absent (related/recursive links)', () => {
        // RelatedObjectsResolver links carry `target` (the child endpoint) but
        // no `one_name`. When the current object is other_thing_id, the one
        // endpoint must resolve from target.name instead of "Unknown".
        const link = {
            ...linkType,
            one_thing_id: 'one',
            other_thing_id: 'current',
            name: 'Victor', // resolver's `name` = target (child) name
            one_name: undefined,
            target: { thing_id: 'one', name: 'Victor' },
        }
        const object = { thing_id: 'current', name: 'Current Object' }
        const wrapper = mount(LinkDescription, { props: { link, object } })
        const text = textOf(wrapper)
        expect(text).toContain('Victor')
        expect(text).toContain('Current Object')
        expect(text).not.toContain('Unknown')
    })
})
