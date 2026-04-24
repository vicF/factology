<template>
    <div v-if="nodeId" class="image-wrapper" :style="wrapperStyle">
        <template v-if="!imageError">
            <img
                :src="getThumbUrl(nodeId)"
                :alt="alt"
                @error="handleImageError"
                class="real-image"
            />
        </template>
        <div v-else class="placeholder" :style="placeholderStyle" v-html="identiconSvg"/>
    </div>
</template>

<script setup>
import {ref, computed, watch, inject} from 'vue'
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
    }
})

const getThumbUrl = inject('getThumbUrl');
const imageError = ref(false)

watch(() => props.nodeId, () => {
    imageError.value = false
}, {immediate: true})

const handleImageError = () => {
    imageError.value = true
}

const identiconSvg = computed(() => {
    // This will only be called when nodeId is truthy because of v-if
    return jdenticon.toSvg(props.nodeId, 100);
})

const wrapperStyle = computed(() => ({
    width: props.width,
    height: 'auto',
    display: 'inline-flex',
    verticalAlign: 'top',
    cursor: 'pointer' // Explicitly set pointer for the link context
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
    user-select: none; /* Prevents text-style highlighting on click */
}

.real-image {
    width: 100%;
    height: auto;
    display: block;
    cursor: pointer;
    -webkit-user-drag: none; /* Prevents dragging the ghost image */
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
</style>
