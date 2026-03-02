<template>
    <div class="graph-wrapper" ref="graphWrapperRef">
        <div ref="containerRef" class="graph-container">
            <RelationGraph
                ref="graphRef"
                :options="graphOptions"
                :on-node-click="onNodeClick"
                :on-line-click="onLineClick"
            >
                <template #node="{ node }">
                    <div class="custom-node" :style="getNodeStyle(node)">
                        <div class="node-image-area">
                            <Image
                                :node-id="node.id"
                                :alt="node.text"
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
import { inject, nextTick, onMounted, ref, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Image from './Image.vue'

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
const graphWrapperRef = ref(null)

const graphOptions = {
    defaultJunctionPoint: 'border',
    defaultLineColor: '#99b3ff',
    defaultNodeColor: '#4a6bff',
    defaultNodeBorderColor: '#1e3b8a',
    defaultNodeFontColor: '#ffffff',
    defaultNodeShape: 1,
    defaultLineShape: 1,
    defaultLineTextColor: '#666666',
    defaultNodeWidth: 120,
    defaultNodeHeight: 100, // Увеличил высоту для картинки
    allowShowDownloadButton: false,
    allowShowFullscreenButton: false,
    moveToCenterWhenChange: true, // Центрируем при загрузке
    zoomToFitWhenChange: false, // НЕ масштабируем автоматически
    layout: {
        layoutName: 'force',
        maxLevel: 3,
        distance_coefficient: 1,
        from: 'top',
        force_node_repulsion: 1,
        force_line_elastic: 1
    }
}

const onNodeClick = (node, event) => {
    console.log('onNodeClick:', node)
    if (node.id && node.data?.type !== 'link_type') {
        router.push({name: 'object', params: {uid: node.id}})
    }
}

const onLineClick = (lineObject, $event) => {
    console.log('onLineClick:', lineObject)
}

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
    }
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
        height: 100,
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
            from: object.class.thing_id,
            to: object.thing_id,
            text: t('is'),
            color: '#6c757d'
        })
    }

    // Связанные объекты
    if (object.links && Array.isArray(object.links)) {
        object.links.forEach((link) => {
            if (!nodeIds.has(link.one_thing_id)) {
                nodes.push({
                    id: link.one_thing_id,
                    text: link.name || t('Class'),
                    color: '#6c757d',
                    borderColor: '#495057',
                    fontColor: '#ffffff',
                    data: object.class
                })
                nodeIds.add(link.one_thing_id)
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

            lines.push({
                id: link.link_id,
                from: link.other_thing_id,
                to: link.one_thing_id,
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

    await graphRef.value.setJsonData({
        rootId: props.object.thing_id,
        nodes: graphData.nodes,
        lines: graphData.lines
    }, async (instance) => {
        console.log('Graph loaded, setting zoom')
        await instance.moveToCenter()
        console.log('Graph centered')
    })
}

defineExpose({
    updateData: updateGraph,
    refreshView: () => {
        if (graphRef.value) {
            const instance = graphRef.value.getInstance()
            if (instance && typeof instance.refresh === 'function') {
                instance.refresh()
            }
        }
    }
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

    // Добавляем обработчик resize
    window.addEventListener('resize', () => {
        if (graphRef.value) {
            const instance = graphRef.value.getInstance()
            if (instance && typeof instance.resize === 'function') {
                instance.resize()
            }
        }
    })
})

onUnmounted(() => {
    window.removeEventListener('resize', () => {})
})
</script>

<style scoped>
.graph-wrapper {
    width: 100%;
    height: 600px; /* Фиксированная высота */
    min-height: 600px;
    position: relative;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden; /* Важно: скрываем только то, что выходит за границы контейнера */
}

.graph-container {
    width: 100%;
    height: 100%;
    background-color: #f8f9fa;
}

/* Стили для кастомного узла */
.custom-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    padding: 8px;
}

.custom-node:hover {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 10;
}

.node-image-area {
    width: 60px;
    height: 45px;
    border: 2px solid white;
    border-radius: 4px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    background-color: #f0f0f0;
    margin-bottom: 5px;
}

.node-text {
    font-size: 12px;
    font-weight: bold;
    text-align: center;
    word-break: break-word;
    max-width: 100%;
    padding: 0 2px;
    color: inherit;
}

/* Адаптивная высота для больших экранов */
@media (min-height: 800px) {
    .graph-wrapper {
        height: 700px;
    }
}

@media (min-height: 1000px) {
    .graph-wrapper {
        height: 800px;
    }
}
</style>
