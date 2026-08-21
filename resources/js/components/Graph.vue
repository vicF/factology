<template>
    <div>
        <!-- Multilevel control: how many levels of related objects to show -->
        <div class="graph-levels mb-1 d-flex align-items-center gap-2">
            <span class="small text-muted">{{ t('Levels') }}</span>
            <div class="btn-group btn-group-sm" role="group" aria-label="Graph levels">
                <button
                    v-for="lvl in [1, 2, 3, 4]"
                    :key="lvl"
                    type="button"
                    class="btn"
                    :class="selectedDepth === lvl ? 'btn-primary' : 'btn-outline-secondary'"
                    @click="selectedDepth = lvl"
                >{{ lvl }}</button>
            </div>
            <span class="small text-muted ms-2">{{ t('Click a node to expand it') }}</span>
        </div>
        <div style="height:calc(100vh - 95px);">
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
                        <div v-if="node.data && node.data._hasChildren" class="node-expand-hint">+</div>
                    </div>
                </template>
            </RelationGraph>
        </div>
    </div>
</template>

<script setup>
import RelationGraph from 'relation-graph-vue3'
import axios from 'axios'
import { inject, ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { objectName } from '../utils/localized.js'
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

// How many levels of related objects the graph renders (refetched on change).
const selectedDepth = ref(2)
// The fetched root object carrying nested `links` (depth = selectedDepth).
const graphObject = ref(null)

// Updated options to force rectangular shapes
const graphOptions = {
    debug: false,
    defaultNodeShape: 1, // 1 = Rectangle (fixes the oval issue)
    defaultJunctionPoint: 'border',
    defaultNodeColor: '#4a6bff',
    defaultLineColor: '#99b3ff',
    layout: {
        layoutName: 'center'
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
        borderRadius: '4px', // Slightly rounded corners for the rectangle
        transition: 'transform 0.2s, box-shadow 0.2s'
    }
}

/**
 * Build {nodes, lines} from a (possibly nested) object. Walk related links
 * recursively via each link's `target.links`, deduping node ids so a thing
 * reachable via several paths appears once.
 */
const buildGraphData = (object) => {
    if (!object) return { nodes: [], lines: [] }

    const nodes = []
    const lines = []
    const nodeIds = new Set()

    const addNode = (node) => {
        if (nodeIds.has(node.id)) return false
        nodeIds.add(node.id)
        nodes.push(node)
        return true
    }

    // Главный узел
    addNode({
        id: object.thing_id,
        text: objectName(object) || t('Unnamed'),
        color: '#4a6bff',
        borderColor: '#1e3b8a',
        fontColor: '#ffffff',
        width: 150,
        height: 100,
        nodeShape: 1,
        data: object
    })

    // Класс объекта
    if (object.class && object.class.thing_id) {
        if (addNode({
            id: object.class.thing_id,
            text: objectName(object.class) || t('Class'),
            color: '#6c757d',
            borderColor: '#495057',
            fontColor: '#ffffff',
            width: 130,
            height: 90,
            nodeShape: 1,
            data: object.class
        })) {
            lines.push({
                id: `class-${object.thing_id}-${object.class.thing_id}`,
                from: object.class.thing_id,
                to: object.thing_id,
                text: t('is'),
                color: '#6c757d'
            })
        }
    }

    // Связанные объекты — рекурсивно до глубины загруженных данных
    const walk = (parentId, links) => {
        if (!Array.isArray(links)) return
        for (const link of links) {
            const target = link.target
            if (!target || !target.thing_id) continue
            const isNew = addNode({
                id: target.thing_id,
                text: objectName(target) || link.name || t('Related'),
                color: '#28a745',
                borderColor: '#1e7e34',
                fontColor: '#ffffff',
                nodeShape: 1,
                data: {
                    ...target,
                    _hasChildren: !!(target.links && target.links.length)
                }
            })
            lines.push({
                id: link.link_id != null ? String(link.link_id) : `l-${parentId}-${target.thing_id}`,
                from: parentId,
                to: target.thing_id,
                text: link.link_name || t('connected'),
                color: '#28a745'
            })
            if (target.links && target.links.length) {
                walk(target.thing_id, target.links)
            }
        }
    }
    walk(object.thing_id, object.links)

    return { nodes, lines }
}

const fetchObject = async (uid, depth) => {
    const { data } = await axios.get(`/object/${uid}?depth=${depth}`)
    return data?.data ?? null
}

const renderGraph = async () => {
    if (!graphRef.value || !graphObject.value) return
    const graphData = buildGraphData(graphObject.value)
    if (graphData.nodes.length === 0) return
    await graphRef.value.setJsonData({
        rootId: graphObject.value.thing_id,
        nodes: graphData.nodes,
        lines: graphData.lines
    })
}

const showGraph = async () => {
    if (!props.object) return
    graphObject.value = await fetchObject(props.object.thing_id, selectedDepth.value)
    await renderGraph()
}

/** Find the link whose target equals nodeId and attach the deeper branch. */
const attachBranch = (node, nodeId, branch) => {
    if (!node || !Array.isArray(node.links)) return false
    for (const link of node.links) {
        if (link.target && link.target.thing_id === nodeId) {
            link.target.links = branch.links || []
            return true
        }
        if (link.target && link.target.links && attachBranch(link.target, nodeId, branch)) {
            return true
        }
    }
    return false
}

/**
 * Node click: unfold a node that still has unloaded related objects in place;
 * navigate when the node is already expanded, is a leaf, or is the root/class.
 */
const onNodeClick = async (node, event) => {
    const nodeData = node.data || {}
    if (nodeData.type === 'link_type') return

    const isRoot = graphObject.value && node.id === graphObject.value.thing_id
    if (!isRoot && nodeData.type === 3 && !nodeData._hasChildren) {
        try {
            const branch = await fetchObject(node.id, 1)
            if (branch && branch.links && branch.links.length) {
                if (attachBranch(graphObject.value, node.id, branch)) {
                    await renderGraph()
                    return
                }
            }
        } catch (error) {
            console.error('Graph.vue - failed to expand node:', error)
        }
    }

    router.push({ name: 'object', params: { uid: node.id } })
}

defineExpose({
    updateData: showGraph,
    refreshView: () => {
        if (graphRef.value) {
            const instance = graphRef.value.getInstance()
            if (instance && typeof instance.refresh === 'function') {
                instance.refresh()
            }
        }
    }
})

watch(() => props.object, async () => {
    await showGraph()
})

watch(selectedDepth, async () => {
    await showGraph()
})

onMounted(async () => {
    if (props.object) {
        await showGraph()
    }
})
</script>

<style scoped>
.custom-node {
    position: relative;
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

.node-expand-hint {
    position: absolute;
    top: 2px;
    right: 6px;
    font-size: 14px;
    font-weight: bold;
    color: #fff;
    background: rgba(0, 0, 0, 0.35);
    border-radius: 8px;
    width: 16px;
    height: 16px;
    line-height: 14px;
    text-align: center;
}
</style>
