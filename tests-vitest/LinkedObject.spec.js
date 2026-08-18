import { mount, config } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest' // Explicit imports for stability
import LinkedObject from '@/components/Fields/LinkedObject.vue'
import ObjectField from '@/components/Fields/ObjectField.vue'
import { useObjectCacheStore } from '@/stores/objectCache'
import i18n from '@/lang/i18n'

// FlexibleDateField (rendered inside every link row) uses `useI18n()`, which
// requires the i18n plugin to be installed on the mounting app.
config.global.plugins = [i18n]

// 1. Mock the store module at the top level
vi.mock('@/stores/objectCache', () => ({
    useObjectCacheStore: vi.fn()
}))

describe('LinkedObject', () => {
    let mockStore

    beforeEach(() => {
        // 2. Clear all mocks and set up the default store state before each test
        vi.clearAllMocks()

        mockStore = {
            hasCachedObject: vi.fn(() => false),
            getCachedObject: vi.fn(),
            fetchOrGetObject: vi.fn(),
            getRecent: vi.fn(() => []),
            searchCached: vi.fn(() => []),
            cacheObject: vi.fn(),
        }

        // Ensure useObjectCacheStore returns our mock object
        useObjectCacheStore.mockReturnValue(mockStore)
    })

    it('renders all three fields in normal mode', () => {
        const wrapper = mount(LinkedObject, {
            props: {
                link: { one_thing_id: '', other_thing_id: '', link_type_id: '' },
                index: 0
            },
            global: {
                stubs: {
                    // Stubbing ObjectField if it has complex logic,
                    // though usually not needed if it's a simple child
                    // ObjectField: true
                }
            }
        })

        // Expect three flex-group divs (one for each field)
        expect(wrapper.findAll('.flex-group').length).toBe(3)
    })

    it('renders only target field in single‑field mode', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                singleField: true,
                link: { other_thing_id: '' },
                index: 0
            }
        })
        await nextTick()

        // Only one flex-group should be present (the ObjectField)
        expect(wrapper.findAll('.flex-group').length).toBe(1)
        // Verify an ObjectField component is rendered
        expect(wrapper.findComponent(ObjectField).exists()).toBe(true)
    })

    it('emits update when swap is clicked', async () => {
        const link = { one_thing_id: 'a', other_thing_id: 'b', link_type_id: 'type' }
        const wrapper = mount(LinkedObject, {
            props: { link, index: 0 }
        })

        // Target the swap button specifically by its icon or class if possible
        // but sticking to your current selector:
        const swapButton = wrapper.find('.btn-primary')
        await swapButton.trigger('click')

        // Check emitted events
        const emitted = wrapper.emitted('update')
        expect(emitted).toBeTruthy()

        const payload = emitted[0][0].data
        expect(payload.one_thing_id).toBe('b')
        expect(payload.other_thing_id).toBe('a')
    })

    // ── Fixed first object (EditObject link rows) ──────────────────────────

    it('locks the first object selector to a read-only display of the current object', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                link: { one_thing_id: 'current-id', other_thing_id: '', link_type_id: 'type' },
                currentObject: { thing_id: 'current-id', name: 'My New Thing' },
                index: 0,
                lockFirstObject: true,
            }
        })
        await nextTick()

        const fields = wrapper.findAllComponents(ObjectField)
        expect(fields[0].props('isEditable')).toBe(false)
        expect(fields[0].props('displayName')).toBe('My New Thing')
        // The read-only display shows the current object's name.
        expect(wrapper.find('.form-control-plaintext').text()).toContain('My New Thing')
        // No editable input for the locked slot.
        expect(wrapper.find('input[data-field-name="one_thing"]').exists()).toBe(false)
    })

    it('shows the <current object> placeholder while the new object has no name', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                link: { one_thing_id: 'current-id', other_thing_id: '', link_type_id: 'type' },
                currentObject: { thing_id: 'current-id', name: '' },
                index: 0,
                lockFirstObject: true,
            }
        })
        await nextTick()

        expect(wrapper.find('.form-control-plaintext').text()).toContain('<current object>')
    })

    it('marks the fixed first object as not saved yet when requested', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                link: { one_thing_id: 'current-id', other_thing_id: '', link_type_id: 'type' },
                currentObject: { thing_id: 'current-id', name: '' },
                index: 0,
                lockFirstObject: true,
                currentObjectUnsaved: true,
            }
        })
        await nextTick()

        const badge = wrapper.find('.badge-unsaved')
        expect(badge.exists()).toBe(true)
        expect(badge.text()).toBe('not saved yet')
    })

    it('hides the badge once the object is saved', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                link: { one_thing_id: 'current-id', other_thing_id: '', link_type_id: 'type' },
                currentObject: { thing_id: 'current-id', name: 'Saved Thing' },
                index: 0,
                lockFirstObject: true,
                currentObjectUnsaved: false,
            }
        })
        await nextTick()

        expect(wrapper.find('.badge-unsaved').exists()).toBe(false)
    })

    it('always shows the Swap button, even when the first object is locked', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                link: { one_thing_id: 'current-id', other_thing_id: 'other-id', link_type_id: 'type' },
                currentObject: { thing_id: 'current-id', name: 'Current' },
                index: 0,
                lockFirstObject: true,
            }
        })
        await nextTick()

        const buttons = wrapper.findAll('button')
        expect(buttons.some(b => b.text().trim() === 'Swap')).toBe(true)
    })

    it('unlocks the first object slot after swapping a locked row', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                link: { one_thing_id: 'current-id', other_thing_id: 'other-id', link_type_id: 'type' },
                currentObject: { thing_id: 'current-id', name: 'Current' },
                index: 0,
                lockFirstObject: true,
            }
        })
        await nextTick()

        const fields = wrapper.findAllComponents(ObjectField)
        // Initially the first selector is read-only (locked to the current object).
        expect(fields[0].props('isEditable')).toBe(false)

        const swapButton = wrapper.findAll('button').find(b => b.text().trim() === 'Swap')
        await swapButton.trigger('click')
        await nextTick()

        // The current object moved to the second slot and the first becomes editable.
        const emitted = wrapper.emitted('update')
        const payload = emitted[emitted.length - 1][0].data
        expect(payload.one_thing_id).toBe('other-id')
        expect(payload.other_thing_id).toBe('current-id')

        const afterSwap = wrapper.findAllComponents(ObjectField)
        expect(afterSwap[0].props('isEditable')).toBe(true)
    })

    it('excludes the current object from the second-object selector when the first is locked', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                link: { one_thing_id: 'current-id', other_thing_id: '', link_type_id: 'type' },
                currentObject: { thing_id: 'current-id', name: 'Current' },
                index: 0,
                lockFirstObject: true,
            }
        })
        await nextTick()

        const fields = wrapper.findAllComponents(ObjectField)
        expect(fields[2].props('excludeUuid')).toBe('current-id')
    })

    it('disables Swap when both ends already point at the same object', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                link: { one_thing_id: 'a', other_thing_id: 'a', link_type_id: 'type' },
                index: 0,
            }
        })
        await nextTick()

        const swapButton = wrapper.findAll('button').find(b => b.text().trim() === 'Swap')
        expect(swapButton.attributes('disabled')).toBeDefined()
    })

    it('excludes the other selected object from both selectors when neither end is locked', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                link: { one_thing_id: 'a', other_thing_id: 'b', link_type_id: 'type' },
                index: 0,
            }
        })
        await nextTick()

        const fields = wrapper.findAllComponents(ObjectField)
        // First selector excludes the selected second object, second excludes
        // the selected first object — an object cannot be linked to itself.
        expect(fields[0].props('excludeUuid')).toBe('b')
        expect(fields[2].props('excludeUuid')).toBe('a')
    })

    it('excludes the current object from the class/parent target in single-field mode', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                singleField: true,
                link: { other_thing_id: '' },
                currentObject: { thing_id: 'current-id', name: 'Current Class' },
                index: 0,
            }
        })
        await nextTick()

        const targetField = wrapper.findComponent(ObjectField)
        expect(targetField.props('excludeUuid')).toBe('current-id')
    })

    it('renders an incoming link preview with distinct endpoints (no self-link)', async () => {
        // The edited object is other_thing_id; the stored one_thing_id is the
        // actual other participant. Its name comes from `one_name` (the API's
        // link.name is the other_thing_id name and would self-reference here).
        const wrapper = mount(LinkedObject, {
            props: {
                link: {
                    one_thing_id: 'victor',
                    other_thing_id: 'trip',
                    link_type_id: 'involved-in',
                    name: 'Поездка в Новгород 2026', // other_thing_id name
                    one_name: 'Виктор Фокин',        // one_thing_id name
                    translation: '',
                    link_id: 1,
                },
                currentObject: { thing_id: 'trip', name: 'Поездка в Новгород 2026' },
                index: 0,
            }
        })
        await nextTick()

        const preview = wrapper.find('.generated-preview')
        expect(preview.exists()).toBe(true)
        const text = preview.text().replace(/\s+/g, ' ').trim()
        expect(text).toContain('Виктор Фокин')
        expect(text).toContain('Поездка в Новгород 2026')
        expect(text).not.toContain('Поездка в Новгород 2026 → участвует в Поездка в Новгород 2026')
    })

    it('focusSecondObject focuses the second-object selector input', async () => {
        const wrapper = mount(LinkedObject, {
            props: {
                link: { one_thing_id: 'a', other_thing_id: '', link_type_id: 'type' },
                index: 0,
            },
            attachTo: document.body, // needed for jsdom focus() to take effect
        })
        await nextTick()

        wrapper.vm.focusSecondObject()
        await nextTick()

        const secondInput = wrapper.find('input[data-field-name="other_thing"]').element
        expect(document.activeElement).toBe(secondInput)
        wrapper.unmount()
    })
})
