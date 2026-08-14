import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest' // Explicit imports for stability
import LinkedObject from '@/components/Fields/LinkedObject.vue'
import ObjectField from '@/components/Fields/ObjectField.vue'
import { useObjectCacheStore } from '@/stores/objectCache'

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

    it('hides the Swap button when the first object is locked', async () => {
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
        expect(buttons.some(b => b.text().trim() === 'Swap')).toBe(false)
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
