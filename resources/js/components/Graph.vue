<template>
    <div class="graph-wrapper">
        <div ref="containerRef" class="graph-container">
            <RelationGraph
                ref="graphRef"
                :options="graphOptions"
                :on-node-click="onNodeClick"
                :on-line-click="onLineClick"
            >
                <!-- Кастомный слот для узлов -->
                <template #node="{ node }">
                    <div class="custom-node" :style="getNodeStyle(node)">
                        <div class="node-image">
                            <img
                                :src="getThumbUrl(node.id)"
                                :alt="node.text"
                                @error="handleImageError"
                            />
                        </div>
                        <div class="node-text">{{ node.text }}</div>
                    </div>
                </template>
            </RelationGraph>
        </div>
    </div>
</template>

<script setup>
import RelationGraph from 'relation-graph-vue3'
import {inject, nextTick, onMounted, ref, watch} from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'


const getThumbUrl = inject('getThumbUrl');

const props = defineProps({
    object: {
        type: Object,
        required: true
    }
})

const router = useRouter()
const { t } = useI18n()
const graphRef = ref(null)
const containerRef = ref(null)

const graphOptions = {
    // Here you can refer to the options in "Graph" for setting:
    // https://www.relation-graph.com/#/docs/graph
    // You can also use this GUI tool to generate configuration content.
    // https://www.relation-graph.com/#/options-tools
    defaultJunctionPoint: 'border',
    defaultLineColor: '#99b3ff',
    defaultNodeColor: '#4a6bff',
    defaultNodeBorderColor: '#1e3b8a',
    defaultNodeFontColor: '#ffffff',
    defaultLineShape: 4,
    defaultLineTextColor: '#666666',
    defaultNodeWidth: 120,
    defaultNodeHeight: 80, // Увеличил высоту для картинки
    allowShowDownloadButton: false,
    allowShowFullscreenButton: false,
    moveToCenterWhenChange: false,
    zoomToFitWhenChange: false,
    layout: {
        layoutName: 'tree',
        maxLevel: 2
    }
}


// Обработка ошибок загрузки изображений
const handleImageError = (event) => {
    event.target.src = '/default-placeholder.jpg'; // Замените на ваш плейсхолдер
    event.target.style.opacity = '0.5';
};

// Стили для узла
const getNodeStyle = (node) => {
    return {
        background: node.color || '#4a6bff',
        border: `2px solid ${node.borderColor || '#1e3b8a'}`,
        color: node.fontColor || '#ffffff',
        borderRadius: '8px',
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
};

const onNodeClick = (node, event) => {
    console.log('onNodeClick:', node)
    if (node.id && node.data?.type !== 'link_type') {
        router.push({name: 'object', params: {uid: node.id}})
    }
}

const onLineClick = (lineObject, $event) => {
    console.log('onLineClick:', lineObject)
}

const buildGraphData = (object) => {
    if (!object) return {nodes: [], lines: []}

    const nodes = []
    const lines = []
    const nodeIds = new Set()

    // Главный узел
    nodes.push({
        id: object.thing_id,
        text: object.name || t('Unnamed'),
        color: '#4a6bff',
        borderColor: '#1e3b8a',
        fontColor: '#ffffff',
        width: 150,
        height: 100, // Увеличен для картинки
        data: object
    })
    nodeIds.add(object.thing_id)

    // Класс объекта
    if (object.class && object.class.thing_id) {
        if (!nodeIds.has(object.class.thing_id)) {
            nodes.push({
                id: object.class.thing_id,
                text: object.class.name || t('Class'),
                color: '#6c757d',
                borderColor: '#495057',
                fontColor: '#ffffff',
                width: 130,
                height: 90,
                data: object.class
            })
            nodeIds.add(object.class.thing_id)
        }

        lines.push({
            id: `class-${object.thing_id}-${object.class.thing_id}`,
            from: object.thing_id,
            to: object.class.thing_id,
            text: t('is a'),
            color: '#6c757d'
        })
    }

    // Связанные объекты
    if (object.links && Array.isArray(object.links)) {
        object.links.forEach((link, index) => {
            // Связанный объект
            if (!nodeIds.has(link.one_thing_id)) {
                nodes.push({
                    id: link.one_thing_id,
                    text: link.name || t('Class'),
                    color: '#6c757d',
                    borderColor: '#495057',
                    fontColor: '#ffffff',
                    data: object.class
                })
                nodeIds.add(object.class.thing_id)
            }
            if (!nodeIds.has(link.other_thing_id)) {
                nodes.push({
                    id: link.other_thing_id,
                    text: link.name || t('Linked object'),
                    color: '#28a745',
                    borderColor: '#1e7e34',
                    fontColor: '#ffffff',
                    data: link
                })
                nodeIds.add(link.other_thing_id)
            }

            // Связь
                lines.push({
                id: link.link_id,
                from: link.one_thing_id,
                to: link.other_thing_id,
                text: link.translation || t('connected'),
                    color: '#28a745'
                })

        })
    }

    return {nodes, lines}
}

const updateGraph = async () => {
    if (!graphRef.value || !props.object) return

    const graphData = buildGraphData(props.object)

    if (graphData.nodes.length === 0) return

    console.log('Updating graph with data:', graphData)

    // Загружаем данные
    await graphRef.value.setJsonData({
        rootId: props.object.thing_id,
        nodes: graphData.nodes,
        lines: graphData.lines
    }, async (instance) => {
        // Этот колбэк вызывается после завершения загрузки
        console.log('Graph loaded, setting zoom')

        // Только центрируем, без масштабирования
        await instance.moveToCenter()

        // Не используем zoomToFit, просто центрируем
        console.log('Graph centered')
    })
}

// Публичный метод для обновления данных
const updateData = async (newObject) => {
    if (!newObject || !graphRef.value) return
    await updateGraph()
}

defineExpose({
    updateData
})

watch(() => props.object, async (newObject) => {
    if (newObject) {
        await nextTick()
        updateGraph()
    }
}, {immediate: true, deep: true})

onMounted(async () => {
    await nextTick()
    if (props.object) {
        updateGraph()
    }
})
</script>

<style scoped>
.graph-wrapper {
    width: 100%;
    height: 100%;
}

.graph-container {
    width: 100%;
    height: 500px;
    border-radius: 8px;
    overflow: hidden;
    background-color: #f8f9fa;
}

/* Стили для кастомного узла */
:deep(.custom-node) {
    transition: transform 0.2s, box-shadow 0.2s;
}

:deep(.custom-node:hover) {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 10;
}

:deep(.node-image) {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
    margin-bottom: 5px;
    border: 2px solid white;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

:deep(.node-image img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

:deep(.node-text) {
    font-size: 12px;
    font-weight: bold;
    text-align: center;
    word-break: break-word;
    max-width: 100%;
    padding: 0 2px;
}

/* Адаптивная высота */
@media (min-height: 800px) {
    .graph-container {
        height: 600px;
    }
}
</style>
