<template>
    <div class="custom-node" :style="getNodeStyle(node)">
        <div class="node-image">
            <img
                v-if="!imageError"
                :src="getThumbUrl(node.id)"
                :alt="node.text"
                @error="handleImageError"
                class="real-image"
            />
            <div v-else class="css-placeholder" :style="placeholderStyle">
                <span class="placeholder-letter">Ф</span>
            </div>
        </div>
        <div class="node-text">{{ node.text }}</div>
    </div>
</template>

<script setup>
import { ref, computed, watch, inject } from 'vue'  // <-- Добавлен inject

const props = defineProps({
    node: {
        type: Object,
        required: true
    }
})

const getThumbUrl = inject('getThumbUrl');
const imageError = ref(false)

watch(() => props.node?.id, () => {
    imageError.value = false
}, { immediate: true })

const handleImageError = () => {
    imageError.value = true
    console.log(`Image failed to load for node ${props.node?.id}`)
}

const backgroundColor = computed(() => {
    if (!props.node?.id) return '#e0e0e0'

    const hash = props.node.id.split('').reduce((acc, char) => {
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

// Стили для узла (если нужны)
const getNodeStyle = (node) => {
    return {
        background: node.color || '#4a6bff',
        border: `2px solid ${node.borderColor || '#1e3b8a'}`,
        color: node.fontColor || '#ffffff',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        cursor: 'pointer',
        transition: 'transform 0.2s, box-shadow 0.2s'
    };
}
</script>

<style scoped>
.node-image {
    width: 40px;
    height: 30px;
    margin-bottom: 5px;
    border: 2px solid white;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    border-radius: 3px;
}

.real-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.css-placeholder {
    width: 100%;
    height: 100%;
}

.placeholder-letter {
    font-size: 18px;
    font-weight: bold;
    color: #666666;
    opacity: 0.7;
}

.node-text {
    font-size: 12px;
    font-weight: bold;
    text-align: center;
    word-break: break-word;
    max-width: 100%;
    padding: 0 2px;
}
</style>
