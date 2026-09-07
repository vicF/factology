// tests-vitest/App.spec.js
//
// The create modal is a stack: the link-row "Create" button opens a nested
// create modal on top of the currently open one. These tests verify the
// stacking behavior in App.vue.

import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from '@/components/App.vue'

// Functional event bus so tests can drive the modal-opening flow the way a
// LinkedObject link row (or TreeMenu) would.
const { busHandlers, eventBusMock, routerPush } = vi.hoisted(() => {
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
    return { busHandlers, eventBusMock, routerPush: vi.fn() }
})

vi.mock('@factology/engine/eventBus.js', () => ({ eventBus: eventBusMock }))

vi.mock('vue-router', () => ({
    useRouter: () => ({ push: routerPush }),
}))

// Stub EditObject so the modal stack is tested without Bootstrap/DOM modal code.
vi.mock('@/components/EditObject.vue', () => ({
    default: {
        name: 'EditObject',
        props: ['object', 'params', 'title', 'initialLinkedObjects', 'callback', 'active'],
        emits: ['object-created', 'object-updated', 'close'],
        template: `
            <div class="edit-object-stub" :data-title="title" :data-active="String(active)">
                <button class="emit-created" @click="$emit('object-created', { thing_id: 'created-1' })">created</button>
                <button class="emit-close" @click="$emit('close')">close</button>
            </div>
        `,
    },
}))

const mountApp = () =>
    mount(App, {
        global: { stubs: { RouterView: true } },
    })

describe('App.vue — stacked create modals', () => {
    beforeEach(() => {
        Object.keys(busHandlers).forEach(k => delete busHandlers[k])
        vi.clearAllMocks()
    })

    it('stacks a second create modal on top of an already-open one', async () => {
        const wrapper = mountApp()
        await flushPromises()

        eventBusMock.emit('open-create-modal', { title: 'Create Book', params: { type: 3 }, callback: null })
        await nextTick()

        let modals = wrapper.findAllComponents({ name: 'EditObject' })
        expect(modals.length).toBe(1)
        expect(modals[0].props('active')).toBe(true)

        // Link-row "Create" while the book modal is open → author modal stacks on top.
        eventBusMock.emit('open-create-modal', {
            title: 'Create new object',
            params: { type: 3 },
            callback: { type: 'link-created', requestId: 'link-0-1' },
        })
        await nextTick()

        modals = wrapper.findAllComponents({ name: 'EditObject' })
        expect(modals.length).toBe(2)
        // Only the top modal is active; the book modal stays mounted underneath.
        expect(modals[0].props('active')).toBe(false)
        expect(modals[1].props('active')).toBe(true)
    })

    it('closes only the top modal and re-activates the one below', async () => {
        const wrapper = mountApp()
        await flushPromises()

        eventBusMock.emit('open-create-modal', { title: 'Create Book', params: { type: 3 }, callback: null })
        await nextTick()
        eventBusMock.emit('open-create-modal', {
            title: 'Create new object',
            params: { type: 3 },
            callback: { type: 'link-created', requestId: 'link-0-1' },
        })
        await nextTick()

        const modals = wrapper.findAllComponents({ name: 'EditObject' })
        modals[1].vm.$emit('close')
        await nextTick()

        const remaining = wrapper.findAllComponents({ name: 'EditObject' })
        expect(remaining.length).toBe(1)
        expect(remaining[0].props('active')).toBe(true)
        expect(remaining[0].props('title')).toBe('Create Book')
    })

    it('does not navigate away when a link-created object is saved', async () => {
        const wrapper = mountApp()
        await flushPromises()

        eventBusMock.emit('open-create-modal', {
            title: 'Create Author',
            params: { type: 3 },
            callback: { type: 'link-created', requestId: 'link-0-1' },
        })
        await nextTick()

        const modals = wrapper.findAllComponents({ name: 'EditObject' })
        modals[0].vm.$emit('object-created', { thing_id: 'author-1' })
        await nextTick()

        expect(routerPush).not.toHaveBeenCalled()
        expect(wrapper.findAllComponents({ name: 'EditObject' }).length).toBe(0)
    })

    it('navigates to the new object for a plain create', async () => {
        const wrapper = mountApp()
        await flushPromises()

        eventBusMock.emit('open-create-modal', { title: 'Create Book', params: { type: 3 }, callback: null })
        await nextTick()

        const modals = wrapper.findAllComponents({ name: 'EditObject' })
        modals[0].vm.$emit('object-created', { thing_id: 'book-1' })
        await nextTick()

        expect(routerPush).toHaveBeenCalledWith({ name: 'object', params: { uid: 'book-1' } })
    })
})
