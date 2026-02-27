<template>
    <div>
        <div style="height:calc(100vh - 60px);"><!-- The size of the parent element determines the size of the graph. -->
            <RelationGraph
                ref="graphRef"
                :options="graphOptions"
                :on-node-click="onNodeClick"
                :on-line-click="onLineClick"
            />
        </div>
    </div>
</template>

<script setup>
import RelationGraph from 'relation-graph-vue3'
import { ref, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'

const props = defineProps({
    object: {
        type: Object,
        required: true
    }
})

const router = useRouter()
const { t } = useI18n()
const graphRef = ref(null)

const graphOptions = {
    /*defaultJunctionPoint: 'border',
    // Here you can refer to the options in "Graph" for setting:
    // https://www.relation-graph.com/#/docs/graph
    // You can also use this GUI tool to generate configuration content.
    // https://www.relation-graph.com/#/options-tools
    defaultLineColor: '#99b3ff',
    defaultNodeColor: '#4a6bff',
    defaultNodeBorderColor: '#1e3b8a',
    defaultNodeFontColor: '#ffffff',
    defaultLineShape: 4,
    defaultLineTextColor: '#666666',
    defaultNodeWidth: 120,
    defaultNodeHeight: 60,*/
    allowShowDownloadButton: true,
    allowShowFullscreenButton: true,
    moveToCenterWhenChange: true,
    zoomToFitWhenChange: true,
/*    layout: {
        layoutName: 'tree',
        maxLevel: 2
    },*/
    // Фиксируем область просмотра
/*    viewPadding: {
        top: 50,
        left: 50
    }*/
}

const onNodeClick = (nodeObject, $event) => {
    console.log('onNodeClick:', nodeObject)
    if (nodeObject.id && nodeObject.data?.type !== 'link_type') {
        router.push({ name: 'object', params: { uid: nodeObject.id } })
    }
}

const onLineClick = (lineObject, $event) => {
    console.log('onLineClick:', lineObject)
}

const buildGraphData = (object) => {
    if (!object) return { nodes: [], lines: [] }

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
            if (link.thing_id && !nodeIds.has(link.thing_id)) {
                nodes.push({
                    id: link.thing_id,
                    text: link.name || t('Linked object'),
                    color: '#28a745',
                    borderColor: '#1e7e34',
                    fontColor: '#ffffff',
                    data: link
                })
                nodeIds.add(link.thing_id)
            }

            // Тип связи
            if (link.link_type_id && !nodeIds.has(link.link_type_id)) {
                nodes.push({
                    id: link.link_type_id,
                    text: link.link_type_name || t('Link type'),
                    color: '#ffc107',
                    borderColor: '#d39e00',
                    fontColor: '#212529',
                    data: { type: 'link_type', id: link.link_type_id }
                })
                nodeIds.add(link.link_type_id)
            }

            // Связь между главным объектом и связанным
            if (link.thing_id) {
                lines.push({
                    id: `link-${index}-${link.link_id || ''}`,
                    from: object.thing_id,
                    to: link.thing_id,
                    text: link.link_type_name || t('connected'),
                    color: '#28a745'
                })
            }

            // Связь между связанным объектом и типом связи
            if (link.thing_id && link.link_type_id) {
                lines.push({
                    id: `link-type-${index}-${link.link_id || ''}`,
                    from: link.thing_id,
                    to: link.link_type_id,
                    text: t('uses type'),
                    color: '#ffc107',
                    lineShape: 2,
                    lineDash: [5, 3]
                })
            }
        })
    }

    return { nodes, lines }
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

// Следим за объектом
watch(() => props.object, async (newObject) => {
    if (newObject) {
        await nextTick()
        updateGraph()
    }
}, { immediate: true, deep: true })

onMounted(async () => {
    await nextTick()
    if (props.object) {
        updateGraph()
    }
})
</script>
