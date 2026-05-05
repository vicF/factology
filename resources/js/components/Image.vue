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
            <div class="image-overlay" :class="{ 'overlay-hidden': shouldHideOverlay }">
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

                <!-- Type icon overlay (bottom right corner) -->
                <div
                    v-if="shouldShowTypeLabel"
                    class="overlay-badge type-badge"
                    :class="typeBadgeClass"
                    :title="typeLabel"
                    @mouseenter="onBadgeMouseEnter"
                    @mouseleave="onBadgeMouseLeave"
                >
                    <!-- Class Icon (Hierarchy/Tree structure) -->
                    <svg v-if="props.type === 2" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 -960 960 960" fill="currentColor">
                        <path d="M160-120q-33 0-56.5-23.5T80-200v-160q0-33 23.5-56.5T160-440h160q33 0 56.5 23.5T400-360v160q0 33-23.5 56.5T320-120H160Zm320-240q-17 0-28.5-11.5T440-400q0-17 11.5-28.5T480-440q17 0 28.5 11.5T520-400q0 17-11.5 28.5T480-360Zm160 0q-17 0-28.5-11.5T600-400q0-17 11.5-28.5T640-440q17 0 28.5 11.5T680-400q0 17-11.5 28.5T640-360Zm160 0q-17 0-28.5-11.5T760-400q0-17 11.5-28.5T800-440q17 0 28.5 11.5T840-400q0 17-11.5 28.5T800-360ZM160-520q-33 0-56.5-23.5T80-600v-160q0-33 23.5-56.5T160-840h160q33 0 56.5 23.5T400-760v160q0 33-23.5 56.5T320-520H160Zm480-80q-17 0-28.5-11.5T600-640q0-17 11.5-28.5T640-680q17 0 28.5 11.5T680-640q0 17-11.5 28.5T640-600Zm160 0q-17 0-28.5-11.5T760-640q0-17 11.5-28.5T800-680q17 0 28.5 11.5T840-640q0 17-11.5 28.5T800-600Z"/>
                    </svg>
                    <!-- Link Icon -->
                    <svg v-else-if="props.type === 4" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 -960 960 960" fill="currentColor">
                        <path d="M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z"/>
                    </svg>
                    <!-- General Icon -->
                    <svg v-else-if="props.type === 1" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 -960 960 960" fill="currentColor">
                        <path d="M480-80 240-220v-260L80-560l400-240 400 240v320h-80v-280l-80 40v260L480-80Zm0-400 160-88-160-88-160 88 160 88Z"/>
                    </svg>
                    <!-- External Icon -->
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
    alternativeUuids: {
        type: Array,
        default: () => []
    },
    type: {
        type: Number,
        default: null
    },
    showTypeLabel: {
        type: Boolean,
        default: true
    },
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
const hideOverlay = ref(false)
let hideTimeout = null
let showTimeout = null

const shouldHideOverlay = computed(() => {
    return hideOverlay.value && !isHoveringBadge.value
})

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

const clearTimeouts = () => {
    if (hideTimeout) {
        clearTimeout(hideTimeout)
        hideTimeout = null
    }
    if (showTimeout) {
        clearTimeout(showTimeout)
        showTimeout = null
    }
}

const onMouseEnter = () => {
    clearTimeouts()
    isHoveringImage.value = true
    hideOverlay.value = true
}

const onMouseLeave = () => {
    isHoveringImage.value = false

    // Wait 3 seconds after mouse leaves, then fade back in
    showTimeout = setTimeout(() => {
        if (!isHoveringImage.value && !isHoveringBadge.value) {
            hideOverlay.value = false
        }
    }, 3000)
}

const onBadgeMouseEnter = () => {
    clearTimeouts()
    isHoveringBadge.value = true
    hideOverlay.value = false
}

const onBadgeMouseLeave = () => {
    isHoveringBadge.value = false

    // If mouse leaves badge but is still on image, hide again after delay
    if (isHoveringImage.value) {
        hideTimeout = setTimeout(() => {
            if (isHoveringImage.value && !isHoveringBadge.value) {
                hideOverlay.value = true
            }
        }, 500)
    } else {
        // If mouse leaves badge and image, wait 3 seconds then show
        showTimeout = setTimeout(() => {
            if (!isHoveringImage.value && !isHoveringBadge.value) {
                hideOverlay.value = false
            }
        }, 3000)
    }
}

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

/* Overlay styles - with smooth fade transition */
.image-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    opacity: 1;
}

.image-overlay.overlay-hidden {
    opacity: 0;
}

.overlay-badge {
    position: absolute;
    border-radius: 3px;
    padding: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
    pointer-events: auto;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    line-height: 1;
}

/* Private badge - top right corner, tightly positioned */
.private-badge {
    top: 2px;
    right: 2px;
    background: rgba(220, 53, 69, 0.4);
}

.private-badge svg {
    width: 9px;
    height: 9px;
    display: block;
}

/* Type badges - bottom right corner, tightly positioned */
.type-badge {
    bottom: 2px;
    right: 2px;
}

.type-badge svg {
    width: 9px;
    height: 9px;
    display: block;
}

/* Light blue for class icon */
.type-class {
    background: rgba(13, 110, 253, 0.55);
    box-shadow: 0 0 2px rgba(13, 110, 253, 0.3);
}

.type-link {
    background: rgba(111, 66, 193, 0.55);
    box-shadow: 0 0 2px rgba(111, 66, 193, 0.3);
}

.type-general {
    background: rgba(108, 117, 125, 0.55);
    box-shadow: 0 0 2px rgba(108, 117, 125, 0.3);
}

.type-external {
    background: rgba(23, 162, 184, 0.55);
    box-shadow: 0 0 2px rgba(23, 162, 184, 0.3);
}

/* Badge hover effects */
.overlay-badge:hover {
    transform: scale(1.2);
    backdrop-filter: blur(3px);
}

.private-badge:hover {
    background: rgba(220, 53, 69, 0.8);
}

.type-class:hover {
    background: rgba(13, 110, 253, 0.85);
}

.type-link:hover {
    background: rgba(111, 66, 193, 0.85);
}

.type-general:hover {
    background: rgba(108, 117, 125, 0.85);
}

.type-external:hover {
    background: rgba(23, 162, 184, 0.85);
}
</style>
