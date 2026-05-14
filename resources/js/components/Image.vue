<template>
    <div v-if="nodeId" class="image-wrapper" :style="wrapperStyle">
        <!-- Main image (always left) -->
        <div class="image-container">
            <template v-if="!imageError">
                <img
                    :src="currentImageUrl"
                    :alt="alt"
                    @error="handleImageError"
                    class="real-image"
                />
            </template>
            <div v-else class="placeholder" :style="placeholderStyle" v-html="identiconSvg" />
        </div>

        <!-- Side bar with icons (always visible, no hover hiding) -->
        <div v-if="sideBar === 'right'" class="vertical-icon-bar">
            <!-- Private icon -->
            <div v-if="isPrivate" class="icon-item private-icon" title="Private">
                <IconPrivate />
            </div>

            <!-- Type icon (only for non‑thing types) -->
            <div v-if="shouldShowTypeLabel" class="icon-item type-icon" :class="typeBadgeClass" :title="typeLabel">
                <IconClass v-if="type === 2" />
                <IconLink v-else-if="type === 4" />
                <IconThing v-else-if="type === 1" />
                <IconExternal v-else-if="type === 5" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, inject } from 'vue'
import * as jdenticon from 'jdenticon'

import IconPrivate from './icons/IconPrivate.vue'
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
    isPrivate: { type: Boolean, default: false },
    sideBar: { type: String, default: null } // 'right' or null
})

const getThumbUrl = inject('getThumbUrl')
const imageError = ref(false)
const currentImageIndex = ref(0)

const typeLabel = computed(() => {
    if (props.type === 2) return 'Class'
    if (props.type === 4) return 'Link'
    if (props.type === 1) return 'General'
    if (props.type === 5) return 'External'
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
    currentImageIndex.value = 0
}, { immediate: true })

watch(() => props.alternativeUuids, () => {
    if (imageError.value) {
        imageError.value = false
        currentImageIndex.value = 0
    }
}, { deep: true })

const handleImageError = () => {
    if (currentImageIndex.value + 1 < imageUrls.value.length) {
        currentImageIndex.value++
    } else {
        imageError.value = true
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

/* Vertical side bar – always visible, small square icons */
.vertical-icon-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    border-radius: 8px;
    padding: 5px 4px;
    pointer-events: auto;
    z-index: 10;
}
.icon-item {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.icon-item svg {
    width: 12px;
    height: 12px;
    display: block;
}
.private-icon {
    background: rgba(220, 53, 69, 0.85);
}
.private-icon:hover {
    background: rgba(220, 53, 69, 1);
    transform: scale(1.1);
}
.type-class {
    background: rgba(13, 110, 253, 0.85);
}
.type-class:hover {
    background: rgba(13, 110, 253, 1);
    transform: scale(1.1);
}
.type-link {
    background: rgba(111, 66, 193, 0.85);
}
.type-link:hover {
    background: rgba(111, 66, 193, 1);
    transform: scale(1.1);
}
.type-general {
    background: rgba(108, 117, 125, 0.85);
}
.type-general:hover {
    background: rgba(108, 117, 125, 1);
    transform: scale(1.1);
}
.type-external {
    background: rgba(23, 162, 184, 0.85);
}
.type-external:hover {
    background: rgba(23, 162, 184, 1);
    transform: scale(1.1);
}
</style>
