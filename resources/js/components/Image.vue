<template>
    <div v-if="nodeId" class="image-wrapper" :style="wrapperStyle">
        <div class="image-container">
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
            <div class="image-overlay">
                <!-- Private lock icon overlay -->
                <div v-if="isPrivate" class="overlay-badge private-badge" title="Private">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 -960 960 960" fill="currentColor">
                        <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-160q33 0 56.5-23.5T560-320q0-33-23.5-56.5T480-400q-33 0-56.5 23.5T400-320q0 33 23.5 56.5T480-240ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/>
                    </svg>
                </div>

                <!-- Type label overlay (only for class and link) -->
                <div v-if="shouldShowTypeLabel" class="overlay-badge type-badge" :class="typeBadgeClass">
                    {{ typeLabel }}
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

// Determine type label and badge class based on numeric type
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
    // Show label for class (2), link (4), general (1), external (5)
    // Don't show for thing (3)
    return props.type !== null && props.type !== 3 && typeLabel.value !== ''
})

// Build array of image URLs to try
const imageUrls = computed(() => {
    const urls = []

    // Primary image
    if (props.nodeId) {
        urls.push(getThumbUrl(props.nodeId))
    }

    // Alternative UUIDs
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
    // Reset on new nodeId
    imageError.value = false
    currentImageIndex.value = 0
}, { immediate: true })

watch(() => props.alternativeUuids, () => {
    // Reset on alternativeUuids change
    if (imageError.value) {
        imageError.value = false
        currentImageIndex.value = 0
    }
}, { deep: true })

const handleImageError = () => {
    // Try next alternative image if available
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

/* Ensure the generated SVG fills the placeholder container */
.placeholder :deep(svg) {
    width: 100%;
    height: 100%;
    display: block;
}

/* Overlay styles */
.image-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
}

.overlay-badge {
    position: absolute;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 9px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    backdrop-filter: blur(4px);
    pointer-events: auto;
}

/* Private badge - top right corner */
.private-badge {
    top: 4px;
    right: 4px;
    background: rgba(220, 53, 69, 0.9);
    padding: 3px 5px;
}

/* Type badge - bottom left corner */
.type-badge {
    bottom: 4px;
    left: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.type-class {
    background: rgba(13, 110, 253, 0.9);
}

.type-link {
    background: rgba(111, 66, 193, 0.9);
}

.type-general {
    background: rgba(108, 117, 125, 0.9);
}

.type-external {
    background: rgba(23, 162, 184, 0.9);
}

/* Hover effect - slightly more visible on hover */
.image-container:hover .overlay-badge {
    background: rgba(0, 0, 0, 0.85);
}

.image-container:hover .private-badge {
    background: rgba(220, 53, 69, 1);
}

.image-container:hover .type-class {
    background: rgba(13, 110, 253, 1);
}

.image-container:hover .type-link {
    background: rgba(111, 66, 193, 1);
}

.image-container:hover .type-general {
    background: rgba(108, 117, 125, 1);
}

.image-container:hover .type-external {
    background: rgba(23, 162, 184, 1);
}
</style>
