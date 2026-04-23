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
        <div v-else class="placeholder" :style="placeholderStyle">
            <span class="placeholder-letter">Ф</span>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, inject } from 'vue'

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

watch(() => props.nodeId, () => {
    imageError.value = false
}, { immediate: true })

const handleImageError = () => {
    imageError.value = true
}

const backgroundColor = computed(() => {
    if (!props.nodeId) return '#e0e0e0'
    const hash = props.nodeId.split('').reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc)
    }, 0)
    const hue = Math.abs(hash % 360)
    return `hsl(${hue}, 25%, 85%)`
})

const wrapperStyle = computed(() => ({
    width: props.width,
    height: 'auto', // Grows based on content proportions
    display: 'inline-flex', // Allows side-by-side placement without overlap
    verticalAlign: 'top' // Fixes the invisible gap at the bottom of images
}))

const placeholderStyle = computed(() => {
    return {
        backgroundColor: backgroundColor.value,
        width: '100%',
        aspectRatio: '1 / 1', // Placeholders are square by default since they have no ratio
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
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
    height: auto; /* This is the key to respecting proportions */
    display: block;
}

.placeholder {
    border-radius: 4px;
}

.placeholder-letter {
    font-size: 1.2rem;
    font-weight: bold;
    color: #666666;
    opacity: 0.7;
}
</style>
