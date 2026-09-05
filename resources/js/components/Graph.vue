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
            <span class="small text-muted ms-2">{{ t('Click a node to open it') }}</span>
        </div>
        <div style="height:calc(100vh - 95px);">
            <RelationGraph
                ref="graphRef"
                :options="graphOptions"
            >
                <template #node="{ node }">
                    <div
                        class="rg-node"
                        :class="{ 'is-root': isRootId(node.id) }"
                        @mousedown="onNodeDown"
                        @click.stop="onNodeClickLocal(node, $event)"
                    >
                        <div class="rg-ring" :style="ringStyle(node)">
                            <span class="rg-glyph" v-html="glyphSvg(node)"></span>
                            <div v-if="!thumbFailed[node.id]" class="rg-media">
                                <img
                                    :src="thumbUrl(node.id)"
                                    :alt="node.text"
                                    draggable="false"
                                    @error="onThumbError(node.id)"
                                />
                            </div>
                            <button
                                v-if="node.data && node.data._hasChildren"
                                class="rg-expander"
                                :title="node.data._collapsed ? t('Expand') : t('Collapse')"
                                @click.stop="toggleNode(node)"
                            >{{ node.data._collapsed ? '+' : '−' }}</button>
                        </div>
                        <div class="rg-name" :title="node.text">{{ node.text }}</div>
                    </div>
                </template>
            </RelationGraph>
        </div>
    </div>
</template>

<script setup>
import RelationGraph from 'relation-graph-vue3'
import axios from 'axios'
import { inject, reactive, ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { objectName, fieldText } from '../utils/localized.js'
import { UUID } from '../constants/uuid.js'

const getThumbUrl = inject('getThumbUrl')

const props = defineProps({
    object: {
        type: Object,
        required: true
    }
})

const router = useRouter()
const { t } = useI18n()
const graphRef = ref(null)

// nodeId → true once its thumbnail failed to load, so the class icon stays.
const thumbFailed = reactive({})
const thumbUrl = (id) => getThumbUrl ? getThumbUrl(id) : ''
const onThumbError = (id) => {
    thumbFailed[id] = true
}

// How many levels of related objects the graph renders (refetched on change).
const selectedDepth = ref(2)
// The fetched root object carrying nested `links` (depth = selectedDepth).
const graphObject = ref(null)
// Root of the loaded related-object tree (used to flatten the visible graph).
const treeRoot = ref(null)
// Ids of nodes whose loaded subtree is currently collapsed.
const collapsed = ref(new Set())

// Per-class colors (stable hash of the class id).
const CLASS_COLORS = [
    '#4a6bff', '#28a745', '#e0a800', '#d9534f', '#6f42c1',
    '#20c997', '#fd7e14', '#17a2b8', '#e83e8c', '#6c757d',
    '#7c6f56', '#54b4d4', '#a6742c', '#7a8c8f', '#3d7ea6',
]
const colorForClassId = (id) => {
    if (!id) return '#4a6bff'
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
    return CLASS_COLORS[h % CLASS_COLORS.length]
}

// relation-graph auto layout. The default node wrapper is made invisible via
// the `rg-ghost` styleClass below, so only our own circle + label are drawn.
const graphOptions = {
    debug: false,
    defaultJunctionPoint: 'border',
    defaultLineColor: '#a7b1d6',
    defaultLineWidth: 1,
    defaultShowLineLabel: true,
    zoomToFitWhenRefresh: true,
    moveToCenterWhenRefresh: true,
    layout: {
        layoutName: 'center'
    }
}

const classOf = (thing) => thing?.class || thing?.classes?.[0] || null
const localizedClassName = (cls) => (cls
    ? (cls.name_translations ? fieldText(cls.name, cls.name_translations) : cls.name)
    : '')

/** Small SVG icon shown inside a node circle while no photo is available. */
const glyphSvg = (node) => {
    const data = node.data || {}
    const color = data._clsColor || '#4a6bff'
    const clsId = data._clsId
    let icon = 'default'
    if (clsId === UUID.HUMAN) icon = 'person'
    else if (clsId === UUID.PHOTO || clsId === UUID.VIDEO) icon = 'media'
    else if (clsId === UUID.MUSIC_BAND) icon = 'music'
    const paths = {
        person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4.2 4.4-6.5 8-6.5s6.8 2.3 8 6.5"/>',
        media: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9.5" cy="11" r="2.2"/><path d="M21 15l-4.5-4.5L8 19"/>',
        music: '<path d="M9 18V6l10-2v11.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
        default: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9.5" r="2.6"/><path d="M5.6 19.2c1-3.6 3.6-5.6 6.4-5.6s5.4 2 6.4 5.6"/>',
    }
    return `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" width="42" height="42">${paths[icon]}</svg>`
}

/**
 * Recursively turn the fetched (nested) object into an internal tree. `children`
 * carries the loaded related subtree; each child remembers the link that leads
 * to it so lines can be labelled.
 */
const buildTree = (thing) => {
    const links = Array.isArray(thing?.links) ? thing.links : []
    const children = links
        .filter((link) => link?.target?.thing_id)
        .map((link) => ({
            ...buildTree(link.target),
            _inLink: link,
        }))
    const cls = classOf(thing)
    return {
        id: thing.thing_id,
        thing,
        text: objectName(thing) || localizedClassName(cls) || t('Unnamed'),
        clsId: cls?.thing_id || cls?.id || null,
        clsName: localizedClassName(cls),
        clsColor: colorForClassId(cls?.thing_id || cls?.id || null),
        children,
    }
}

const linkLabel = (treeNode) => {
    const link = treeNode._inLink
    if (!link) return null
    return fieldText(link.link_name, link.link_name_translations) || null
}

const isCollapsed = (id) => collapsed.value.has(id)

/** Flatten the visible part of the loaded tree into JsonNodes + labelled lines. */
const buildGraphJson = (root) => {
    const nodes = []
    const lines = []

    const visit = (treeNode) => {
        const nodeId = treeNode.id
        const { thing, _inLink: _link, children: _kids } = treeNode
        const { links: _links, ...thingData } = thing || {}
        const isCollapsedNode = isCollapsed(nodeId)
        nodes.push({
            id: nodeId,
            text: treeNode.text,
            nodeShape: 1,
            width: 120,
            height: 160,
            styleClass: 'rg-ghost',
            disableDefaultClickEffect: true,
            color: 'transparent',
            data: {
                ...thingData,
                _clsId: treeNode.clsId,
                _clsName: treeNode.clsName,
                _clsColor: treeNode.clsColor,
                _hasChildren: (treeNode.children || []).length > 0,
                _collapsed: isCollapsedNode,
            },
        })
        if (isCollapsedNode) return
        for (const child of treeNode.children) {
            lines.push({
                id: `${nodeId}→${child.id}`,
                from: nodeId,
                to: child.id,
                text: linkLabel(child) || t('connected'),
                color: '#a7b1d6',
            })
            visit(child)
        }
    }

    visit(root)
    return { nodes, lines }
}

const isRootId = (id) => !!graphObject.value && id === graphObject.value.thing_id
const ringStyle = (node) => {
    const color = (node.data && node.data._clsColor) || '#4a6bff'
    return { borderColor: color }
}

const fetchObject = async (uid, depth) => {
    const { data } = await axios.get(`/object/${uid}?depth=${depth}`)
    return data?.data ?? null
}

const renderGraph = async () => {
    if (!graphRef.value || !treeRoot.value) return
    const { nodes, lines } = buildGraphJson(treeRoot.value)
    if (nodes.length === 0) return
    await graphRef.value.setJsonData({
        rootId: graphObject.value.thing_id,
        nodes,
        lines,
    })
}

const showGraph = async () => {
    if (!props.object) return
    graphObject.value = await fetchObject(props.object.thing_id, selectedDepth.value)
    treeRoot.value = graphObject.value ? buildTree(graphObject.value) : null
    collapsed.value = new Set()
    await renderGraph()
}

/** Toggle the loaded subtree of a node (shown via the +/- button). */
const toggleNode = (node) => {
    if (!node || !node.data || !node.data._hasChildren) return
    const id = node.id
    const next = new Set(collapsed.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    collapsed.value = next
    renderGraph()
}

// Pointer position when the press started, to tell a real click apart from a
// node drag (relation-graph lets nodes be dragged around; releasing after a
// drag must not open the object).
const nodeDown = ref(null)
const onNodeDown = (e) => {
    nodeDown.value = e ? { x: e.clientX, y: e.clientY } : null
}

/** Clicking a node circle opens that object — unless the node was dragged. */
const onNodeClickLocal = (node, e) => {
    const down = nodeDown.value
    nodeDown.value = null
    if (down && e && (Math.abs(e.clientX - down.x) > 5 || Math.abs(e.clientY - down.y) > 5)) {
        return // pointer moved: that was a drag, not a click
    }
    openObject(node)
}

/** Clicking a node circle opens that object (client-side route change). */
const openObject = (node) => {
    router.push({ name: 'object', params: { uid: node.id } })
}

defineExpose({
    updateData: showGraph,
    openObject,
    toggleNode,
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

<style>
/* Hide relation-graph's own node wrapper (it would draw a second ellipse
   behind our custom circle + label). Only our slot content stays visible. */
.relation-graph .rel-node.rg-ghost {
    background-color: transparent !important;
    border: 0 !important;
    box-shadow: none !important;
    outline: none !important;
    border-radius: 0 !important;
}
.relation-graph .rel-node.rg-ghost.rel-node-checked,
.relation-graph .rel-node.rg-ghost.rel-node-flashing {
    box-shadow: none !important;
    outline: none !important;
}
</style>

<style scoped>
.rg-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    width: 120px;
    height: 160px;
    box-sizing: border-box;
    cursor: pointer;
    background: transparent;
}

.rg-ring {
    position: relative;
    width: 88px;
    height: 88px;
    border-radius: 50%;
    border: 3px solid #4a6bff;
    box-sizing: border-box;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    flex-shrink: 0;
}

.rg-ring:hover {
    transform: scale(1.06);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
}

.rg-glyph {
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    width: 100%;
    height: 100%;
    pointer-events: none;
}

.rg-media {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    overflow: hidden;
}

.rg-media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.rg-expander {
    position: absolute;
    right: -8px;
    bottom: -8px;
    width: 22px;
    height: 22px;
    line-height: 20px;
    font-size: 16px;
    font-weight: 700;
    text-align: center;
    border-radius: 50%;
    border: 2px solid #fff;
    cursor: pointer;
    color: #fff;
    background: #4a6bff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    padding: 0;
    box-sizing: border-box;
}

.rg-name {
    margin-top: 7px;
    max-width: 118px;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
    color: #333;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
</style>
