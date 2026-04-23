<template>
    <div class="image-wrapper" :style="wrapperStyle">
        <template v-if="!imageError">
            <img
                :src="getThumbUrl(nodeId)"
                :alt="alt"
                @error="handleImageError"
                class="real-image"
            />
        </template>
        <div v-else class="placeholder" :style="placeholderStyle" v-html="identiconSvg">
        </div>
    </div>
</template>

<script setup>
import {ref, computed, watch, inject} from 'vue'
import * as jdenticon from 'jdenticon' // Import the library

const props = defineProps({
    nodeId: {
        type: String,
        required: true
    },
    alt: {
        type: String,
        default: ''
    },
    width: {
        type: String,
        default: '100%'
    }
})

const getThumbUrl = inject('getThumbUrl');
const imageError = ref(false)

// Reset error state when nodeId changes
watch(() => props.nodeId, () => {
    imageError.value = false
}, {immediate: true})

const handleImageError = () => {
    imageError.value = true
}

// Generate the SVG string using Jdenticon
const identiconSvg = computed(() => {
    // We use a size of 100, but it will scale to 100% of the container
    return jdenticon.toSvg(props.nodeId, 100);
})

const wrapperStyle = computed(() => ({
    width: props.width,
    height: 'auto',
    display: 'inline-flex',
    verticalAlign: 'top'
}))

const placeholderStyle = computed(() => {
    return {
        width: '100%',
        aspectRatio: '1 / 1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: '4px',
        backgroundColor: '#f8f9fa' // Light neutral background for the icon
    }
})
</script>

<style scoped>
.image-wrapper {
    align-items: center;
    justify-content: center;
    overflow: hidden;
}

.real-image {
    width: 100%;
    height: auto;
    display: block;
}

/* Ensure the generated SVG fills the placeholder container */
.placeholder :deep(svg) {
    width: 100%;
    height: 100%;
    display: block;
}
</style>
