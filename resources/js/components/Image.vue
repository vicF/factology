<!-- Image.vue -->
<template>
    <div class="image-container" :style="containerStyle">
        <img
            v-if="!imageError"
            :src="getThumbUrl(nodeId)"
            :alt="alt"
            @error="handleImageError"
            @load="onImageLoad"
            class="real-image"
            :style="imageStyle"
        />
        <div v-else class="css-placeholder" :style="placeholderStyle">
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
    }
})

const getThumbUrl = inject('getThumbUrl');
const imageError = ref(false)
const imageDimensions = ref(null)

watch(() => props.nodeId, () => {
    imageError.value = false
    imageDimensions.value = null
}, { immediate: true })

const handleImageError = () => {
    imageError.value = true
    console.log(`Image failed to load for node ${props.nodeId}`)
}

const onImageLoad = (event) => {
    const img = event.target
    imageDimensions.value = {
        width: img.naturalWidth,
        height: img.naturalHeight
    }
}

// Контейнер подстраивается под размеры изображения, но с ограничениями
const containerStyle = computed(() => {
    if (!imageDimensions.value || imageError.value) {
        return {
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }
    }

    const { width, height } = imageDimensions.value
    const maxWidth = 60
    const maxHeight = 45

    // Сохраняем пропорции, но не превышаем максимальные размеры
    let containerWidth = width
    let containerHeight = height

    if (width > maxWidth) {
        containerWidth = maxWidth
        containerHeight = (height * maxWidth) / width
    }

    if (containerHeight > maxHeight) {
        containerHeight = maxHeight
        containerWidth = (width * maxHeight) / height
    }

    return {
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto'
    }
})

const imageStyle = computed(() => {
    if (!imageDimensions.value) return {}

    return {
        width: '100%',
        height: '100%',
        objectFit: 'contain' // Вписываем без обрезки
    }
})

// Генерация цвета на основе nodeId
const backgroundColor = computed(() => {
    if (!props.nodeId) return '#e0e0e0'

    const hash = props.nodeId.split('').reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc)
    }, 0)

    const hue = Math.abs(hash % 360)
    return `hsl(${hue}, 25%, 85%)`
})

const placeholderStyle = computed(() => {
    return {
        backgroundColor: backgroundColor.value,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    }
})
</script>

<style scoped>
.image-container {
    transition: all 0.2s ease;
}

.real-image {
    display: block;
}

.css-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.placeholder-letter {
    font-size: 18px;
    font-weight: bold;
    color: #666666;
    opacity: 0.7;
}
</style>
