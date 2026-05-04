<template>
    <div v-if="nodeId" class="image-wrapper" :style="wrapperStyle">
        <div class="image-container" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
            <template v-if="!imageError">
                <img
                    :src="currentImageUrl"
                    :alt="alt"
                    @error="handleImageError"
                    class="real-image"
                />
            </template>
            <div v-else class="placeholder" :style="placeholderStyle" v-html="identiconSvg"/>

            <!-- Overlay -->
            <div class="image-overlay" :class="{ 'overlay-hidden': isHoveringImage && !isHoveringBadge }">
                <!-- Private lock icon overlay -->
                <div
                    v-if="isPrivate"
                    class="overlay-badge private-badge"
                    title="Private"
                    @mouseenter="onBadgeMouseEnter"
                    @mouseleave="onBadgeMouseLeave"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 -960 960 960" fill="currentColor">
                        <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-160q33 0 56.5-23.5T560-320q0-33-23.5-56.5T480-400q-33 0-56.5 23.5T400-320q0 33 23.5 56.5T480-240ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/>
                    </svg>
                </div>

                <!-- Type icon overlay (using icons instead of text) -->
                <div
                    v-if="shouldShowTypeLabel"
                    class="overlay-badge type-badge"
                    :class="typeBadgeClass"
                    :title="typeLabel"
                    @mouseenter="onBadgeMouseEnter"
                    @mouseleave="onBadgeMouseLeave"
                >
                    <svg v-if="props.type === 2" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 -960 960 960" fill="currentColor">
                        <path d="M480-120 200-280v-240L40-600l440-240 440 240v400h-80v-360l-80 40v240l-280 160Zm0-280 160-88v-80l-160 88-160-88v80l160 88Zm-80 200v-80l-80-44v80l80 44Zm160 0 80-44v-80l-80 44v80ZM480-480l160-88-160-88-160 88 160 88Z"/>
                    </svg>
                    <svg v-else-if="props.type === 4" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 -960 960 960" fill="currentColor">
                        <path d="M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z"/>
                    </svg>
                    <svg v-else-if="props.type === 1" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 -960 960 960" fill="currentColor">
                        <path d="M480-80 240-220v-260L80-560l400-240 400 240v320h-80v-280l-80 40v260L480-80Zm0-400 160-88-160-88-160 88 160 88Z"/>
                    </svg>
                    <svg v-else-if="props.type === 5" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 -960 960 960" fill="currentColor">
                        <path d="M480-80 200-280v-240L40-600l440-240 440 240v400h-80v-360l-80 40v240L480-80Z"/>
                    </svg>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, inject } from 'vue'
import * as jdenticon from 'jdenticon'

const props = defineProps({
    nodeId: {
        type: String,
        required: false,
        default: null
    },
    alt: {
        type: String,
        default: ''
    },
    width: {
        type: String,
        default: '100%'
    },
    // Alternative UUIDs to try if main image fails
    alternativeUuids: {
        type: Array,
        default: () => []
    },
    // Numeric object type: 1=general, 2=class, 3=thing, 4=link, 5=external
    type: {
        type: Number,
        default: null
    },
    // Whether to show the type label overlay (default: true for non-thing)
    showTypeLabel: {
        type: Boolean,
        default: true
    },
    // Is this object private? Shows lock icon overlay
    isPrivate: {
        type: Boolean,
        default: false
    }
})

const getThumbUrl = inject('getThumbUrl');
const imageError = ref(false)
const currentImageIndex = ref(0)
const isHoveringImage = ref(false)
const isHoveringBadge = ref(false)

// Determine type label for tooltip
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

// Show type label only for non-thing types (where type is not 3)
const shouldShowTypeLabel = computed(() => {
    if (!props.showTypeLabel) return false
    return props.type !== null && props.type !== 3 && typeLabel.value !== ''
})

// Hover handlers
const onMouseEnter = () => {
    isHoveringImage.value = true
}

const onMouseLeave = () => {
    isHoveringImage.value = false
    isHoveringBadge.value = false
}

const onBadgeMouseEnter = () => {
    isHoveringBadge.value = true
}

const onBadgeMouseLeave = () => {
    isHoveringBadge.value = false
}

// Build array of image URLs to try
const imageUrls = computed(() => {
    const urls = []

    if (props.nodeId) {
        urls.push(getThumbUrl(props.nodeId))
    }

    if (props.alternativeUuids && props.alternativeUuids.length) {
        props.alternativeUuids.forEach(uuid => {
            if (uuid && uuid !== props.nodeId) {
                urls.push(getThumbUrl(uuid))
            }
        })
    }

    return urls
})

const currentImageUrl = computed(() => {
    return imageUrls.value[currentImageIndex.value] || ''
})

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

const identiconSvg = computed(() => {
    return jdenticon.toSvg(props.nodeId, 100);
})

const wrapperStyle = computed(() => ({
    width: props.width,
    height: 'auto',
    display: 'inline-flex',
    verticalAlign: 'top',
    cursor: 'pointer',
    position: 'relative'
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
    align-items: center;
    justify-content: center;
    overflow: hidden;
    user-select: none;
    position: relative;
}

.image-container {
    position: relative;
    display: inline-block;
    width: 100%;
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

/* Overlay styles - very transparent */
.image-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
}

/* Hide overlay when hovering image (but not badge) */
.image-overlay.overlay-hidden {
    opacity: 0;
}

.overlay-badge {
    position: absolute;
    background: rgba(0, 0, 0, 0.25);
    color: white;
    border-radius: 3px;
    padding: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    backdrop-filter: blur(2px);
    pointer-events: auto;
    cursor: pointer;
    transition: all 0.2s ease;
}

/* Private badge - top right corner */
.private-badge {
    top: 3px;
    right: 3px;
    background: rgba(220, 53, 69, 0.35);
    padding: 2px;
}

.private-badge svg {
    width: 8px;
    height: 8px;
}

/* Type badge - bottom left corner */
.type-badge {
    bottom: 3px;
    left: 3px;
    background: rgba(0, 0, 0, 0.25);
    padding: 2px;
}

.type-badge svg {
    width: 8px;
    height: 8px;
}

/* Slightly more visible on badge hover only */
.overlay-badge:hover {
    background: rgba(0, 0, 0, 0.5);
    transform: scale(1.1);
}

.private-badge:hover {
    background: rgba(220, 53, 69, 0.7);
}

.type-class:hover {
    background: rgba(13, 110, 253, 0.6);
}

.type-link:hover {
    background: rgba(111, 66, 193, 0.6);
}

.type-general:hover {
    background: rgba(108, 117, 125, 0.6);
}

.type-external:hover {
    background: rgba(23, 162, 184, 0.6);
}

/* Remove the container hover effect that was making them brighter */
.image-container:hover .overlay-badge {
    /* No change - badges stay the same opacity */
}
</style>
