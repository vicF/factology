import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import Image from '@/components/Image.vue'

vi.mock('jdenticon', () => ({
    toSvg: () => '<svg id="identicon-mock"></svg>',
}))

const getThumbUrl = (id) => `/thumbs/${id.slice(0, 1)}/${id.slice(1, 2)}/${id}.jpg`

function mountImage(extraProps = {}) {
    return mount(Image, {
        props: { nodeId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', ...extraProps },
        global: { provide: { getThumbUrl } },
    })
}

describe('Image', () => {
    it('shows the identicon placeholder by default when the thumbnail is missing', async () => {
        const wrapper = mountImage()
        expect(wrapper.find('.image-wrapper').exists()).toBe(true)
        await wrapper.find('img').trigger('error')
        expect(wrapper.find('img').exists()).toBe(false)
        expect(wrapper.find('.placeholder').exists()).toBe(true)
    })

    it('hideWhenNoImage: collapses and emits has-image=false when no real image exists', async () => {
        const wrapper = mountImage({ hideWhenNoImage: true })
        await wrapper.find('img').trigger('error')
        expect(wrapper.find('.placeholder').exists()).toBe(false)
        expect(wrapper.find('.image-wrapper').exists()).toBe(false)
        expect(wrapper.emitted('has-image')).toEqual([[false]])
    })

    it('hideWhenNoImage: keeps the thumbnail hidden until it loads, then emits has-image=true', async () => {
        const wrapper = mountImage({ hideWhenNoImage: true })
        const img = wrapper.find('img')
        // Not shown until a real image is confirmed (display:none via :style).
        expect(img.attributes('style')).toContain('display: none')
        await img.trigger('load')
        expect(wrapper.emitted('has-image')).toEqual([[true]])
        expect(wrapper.find('img').attributes('style')).not.toContain('display: none')
    })
})
