<template>
    <div v-if="nodeId && !(hideWhenNoImage && imageError)" class="image-wrapper" :style="wrapperStyle">
        <div class="image-container">
            <img
                v-if="!imageError"
                :src="currentImageUrl"
                :alt="alt"
                @error="handleImageError"
                @load="handleImageLoad"
                class="real-image"
                :style="(!hideWhenNoImage || imageReady) ? {} : { display: 'none' }"
            />
            <div v-else-if="!hideWhenNoImage" class="placeholder" :style="placeholderStyle" v-html="identiconSvg" />
        </div>
        <div v-if="sideBar === 'right'" class="vertical-icon-bar">
            <div v-if="shouldShowTypeLabel" class="icon-item type-icon" :class="typeBadgeClass" :title="$t(typeLabel)">
                <IconClass v-if="type === 2" />
                <IconLink v-else-if="type === 4" />
                <IconThing v-else-if="type === 1" />
                <IconExternal v-else-if="type === 5" />
            </div>
            <div v-if="!hasAnyIcon" class="icon-item invisible-placeholder"></div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, inject } from 'vue'
import * as jdenticon from 'jdenticon'
import IconClass from './icons/IconClass.vue'
import IconLink from './icons/IconLink.vue'
import IconThing from './icons/IconThing.vue'
import IconExternal from './icons/IconExternal.vue'

const props = defineProps({
    nodeId: { type: String, default: null },
    alt: { type: String, default: '' },
    width: { type: String, default: '100%' },
    alternativeUuids: { type: Array, default: () => [] },
    type: { type: Number, default: null },
    showTypeLabel: { type: Boolean, default: true },
    sideBar: { type: String, default: null },
    /**
     * When true, the component never renders the generated identicon
     * placeholder and hides itself entirely when no real image is available.
     * Emits `has-image` (true on successful load, false when the last URL
     * fails) so parents can collapse layout reserved for the thumbnail.
     */
    hideWhenNoImage: { type: Boolean, default: false }
})

const getThumbUrl = inject('getThumbUrl')
const emit = defineEmits(['has-image'])
const imageError = ref(false)
const imageReady = ref(false)
const currentImageIndex = ref(0)

const typeLabel = computed(() => {
    if (props.type === 2) return 'Type Class'
    if (props.type === 4) return 'Type Link'
    if (props.type === 1) return 'Type General'
    if (props.type === 5) return 'Type External'
    return ''
})

const typeBadgeClass = computed(() => {
    if (props.type === 2) return 'type-class'
    if (props.type === 4) return 'type-link'
    if (props.type === 1) return 'type-general'
    if (props.type === 5) return 'type-external'
    return ''
})

const shouldShowTypeLabel = computed(() => {
    if (!props.showTypeLabel) return false
    return props.type !== null && props.type !== 3 && typeLabel.value !== ''
})

const hasAnyIcon = computed(() => shouldShowTypeLabel.value)

const imageUrls = computed(() => {
    const urls = []
    if (props.nodeId) urls.push(getThumbUrl(props.nodeId))
    if (props.alternativeUuids?.length) {
        props.alternativeUuids.forEach(uuid => {
            if (uuid && uuid !== props.nodeId) urls.push(getThumbUrl(uuid))
        })
    }
    return urls
})

const currentImageUrl = computed(() => imageUrls.value[currentImageIndex.value] || '')

watch(() => props.nodeId, () => {
    imageError.value = false
    imageReady.value = false
    currentImageIndex.value = 0
}, { immediate: true })

watch(() => props.alternativeUuids, () => {
    if (imageError.value) {
        imageError.value = false
        imageReady.value = false
        currentImageIndex.value = 0
    }
}, { deep: true })

const handleImageLoad = () => {
    imageReady.value = true
    emit('has-image', true)
}

const handleImageError = () => {
    if (currentImageIndex.value + 1 < imageUrls.value.length) {
        currentImageIndex.value++
    } else {
        imageError.value = true
        emit('has-image', false)
    }
}

const identiconSvg = computed(() => jdenticon.toSvg(props.nodeId, 100))

const wrapperStyle = computed(() => ({
    width: props.width,
    height: 'auto',
    display: 'inline-flex',
    verticalAlign: 'top',
    cursor: 'pointer',
    position: 'relative',
    alignItems: 'flex-start',
    gap: props.sideBar === 'right' ? '6px' : '0'
}))

const placeholderStyle = computed(() => ({
    width: '100%',
    aspectRatio: '1 / 1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: '4px',
    backgroundColor: '#f8f9fa'
}))
</script>

<style scoped>
.image-wrapper {
    align-items: flex-start;
    justify-content: center;
    overflow: visible;
    user-select: none;
    position: relative;
}
.image-container {
    position: relative;
    display: inline-block;
    width: 100%;
    flex-shrink: 0;
}
.real-image {
    width: 100%;
    height: auto;
    display: block;
    cursor: pointer;
    -webkit-user-drag: none;
}
.placeholder {
    cursor: pointer;
}
.placeholder :deep(svg) {
    width: 100%;
    height: 100%;
    display: block;
}
.vertical-icon-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 18px;
    pointer-events: auto;
}
.icon-item {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: transform 0.2s ease;
    color: white;
}
.icon-item svg {
    width: 12px;
    height: 12px;
    display: block;
    stroke: white;
    fill: none;
}
.icon-item svg[fill="currentColor"] {
    fill: white;
    stroke: none;
}
.invisible-placeholder {
    visibility: hidden;
    pointer-events: none;
    background: transparent;
}
.private-icon { background: rgba(220, 53, 69, 0.9); }
.private-icon:hover { background: rgba(220, 53, 69, 1); transform: scale(1.05); }
.public-icon { background: rgba(40, 167, 69, 0.9); }
.public-icon:hover { background: rgba(40, 167, 69, 1); transform: scale(1.05); }
.type-class { background: rgba(13, 110, 253, 0.9); }
.type-class:hover { background: rgba(13, 110, 253, 1); transform: scale(1.05); }
.type-link { background: rgba(111, 66, 193, 0.9); }
.type-link:hover { background: rgba(111, 66, 193, 1); transform: scale(1.05); }
.type-general { background: rgba(108, 117, 125, 0.9); }
.type-general:hover { background: rgba(108, 117, 125, 1); transform: scale(1.05); }
.type-external { background: rgba(23, 162, 184, 0.9); }
.type-external:hover { background: rgba(23, 162, 184, 1); transform: scale(1.05); }
</style>
