<template>
    <div class="image-wrapper">
        <!-- Пытаемся загрузить реальную картинку -->
        <template v-if="!imageError">
            <img
                :src="getThumbUrl(nodeId)"
                :alt="alt"
                @error="handleImageError"
                class="real-image"
            />
        </template>
        <!-- Показываем плейсхолдер только при ошибке -->
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
    }
})

const getThumbUrl = inject('getThumbUrl');
const imageError = ref(false)

watch(() => props.nodeId, () => {
    imageError.value = false
}, { immediate: true })

const handleImageError = () => {
    imageError.value = true
    console.log(`Image failed to load for node ${props.nodeId}`)
}

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
.image-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.real-image {
    width: 100%;
    height: 100%;
    object-fit: contain; /* Важно: contain сохраняет пропорции */
    display: block;
}

.placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.placeholder-letter {
    font-size: 20px;
    font-weight: bold;
    color: #666666;
    opacity: 0.7;
}
</style>
