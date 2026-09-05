<template>
    <div class="graph-wrap" style="height:calc(100vh - 56px);">
        <!-- Floating panel over the graph. The head (Levels 1-4) is always
             visible; the Group controls unfold/collapse below it. -->
        <div class="graph-hud" :class="{ 'is-mini': !hudOpen }">
            <div class="graph-hud-head">
                <span class="graph-hud-label">{{ t('Levels') }}</span>
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
                <button
                    type="button"
                    class="graph-hud-toggle"
                    :title="hudOpen ? t('Hide') : t('Group')"
                    :aria-label="hudOpen ? t('Hide') : t('Group')"
                    @click="hudOpen = !hudOpen"
                >
                    <svg v-if="!hudOpen" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 6h9v2H4zM4 11h5v2H4zM4 16h11v2H4z" />
                        <circle cx="17" cy="7" r="2.4" />
                        <circle cx="14" cy="12" r="2.4" />
                        <circle cx="19" cy="17" r="2.4" />
                    </svg>
                    <span v-else>×</span>
                </button>
            </div>

            <div v-if="hudOpen" class="graph-hud-body">
                <div class="graph-hud-group">
                    <div class="graph-hud-line">
                        <span class="graph-hud-label">{{ t('Group') }}:</span>
                        <label class="graph-hud-check">
                            <input v-model="groupCfg.byType" type="checkbox">
                            <span>{{ t('by link type') }}</span>
                        </label>
                        <label class="graph-hud-check">
                            <input v-model="groupCfg.byClass" type="checkbox">
                            <span>{{ t('by class') }}</span>
                        </label>
                    </div>
                    <div class="graph-hud-steppers">
                        <span class="graph-hud-stepper">
                            {{ t('fold when a type has more than') }}
                            <span class="graph-hud-num">
                                <button type="button" @click="bump('typeAbove', -1)" aria-label="−">−</button>
                                <b>{{ groupCfg.typeAbove }}</b>
                                <button type="button" @click="bump('typeAbove', 1)" aria-label="+">+</button>
                            </span>
                        </span>
                        <span class="graph-hud-stepper">
                            {{ t('a class more than') }}
                            <span class="graph-hud-num">
                                <button type="button" @click="bump('classAbove', -1)" aria-label="−">−</button>
                                <b>{{ groupCfg.classAbove }}</b>
                                <button type="button" @click="bump('classAbove', 1)" aria-label="+">+</button>
                            </span>
                        </span>
                        <span class="graph-hud-stepper">
                            {{ t('only when total links exceed') }}
                            <span class="graph-hud-num">
                                <button type="button" @click="bump('clutter', -1)" aria-label="−">−</button>
                                <b>{{ groupCfg.clutter }}</b>
                                <button type="button" @click="bump('clutter', 1)" aria-label="+">+</button>
                            </span>
                        </span>
                    </div>
                </div>

                <div class="graph-hud-hint">{{ t('Click a node to open it') }}</div>
            </div>
        </div>

        <div class="graph-canvas">
            <RelationGraph
                ref="graphRef"
                :options="graphOptions"
                :on-line-click="onLineClick"
            >
                <template #node="{ node }">
                    <div
                        class="rg-node"
                        :class="{
                            'is-root': isRootId(node.id),
                            'is-folder': isFolderNode(node),
                        }"
                        @mousedown="onNodeDown"
                        @click.stop="onNodeClickLocal(node, $event)"
                    >
                        <template v-if="isFolderNode(node)">
                            <!-- A group of many same-type/same-class links is just
                                 a small +/− circle; the relation name sits on the link. -->
                            <div class="rg-folder" :class="{ 'is-open': !node.data._collapsed }">
                                {{ node.data._collapsed ? '+' : '−' }}
                            </div>
                        </template>
                        <template v-else>
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
                        </template>
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
import { foldChildren } from '../utils/graphFold.js'

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
// The fetched full graph {root_id, nodes:[], edges:[]} (depth = selectedDepth).
const graphObject = ref(null)
// Every link between the displayed objects (drawn in addition to the tree).
const graphEdges = ref([])
// Root of the loaded spanning tree (used to flatten the visible graph).
const treeRoot = ref(null)
// Ids of nodes whose loaded subtree is currently collapsed.
const collapsed = ref(new Set())
// Ids of group folders that are currently unfolded (folders start collapsed).
const expandedGroups = ref(new Set())
// Whether the Group section of the floating panel is open. The Levels head is
// always visible; the panel starts collapsed so the graph is unobstructed.
const hudOpen = ref(false)
// Grouping settings (fold many same-type / same-class children into folders).
const groupCfg = reactive({
    byType: true,
    byClass: true,
    typeAbove: 4,    // pack a type bucket when it has MORE than this many children
    classAbove: 4,   // same for same-class buckets
    clutter: 8,      // pack only when the object has MORE than this many children total
})
const bump = (key, delta) => {
    const min = 1
    const max = key === 'clutter' ? 100 : 30
    groupCfg[key] = Math.max(min, Math.min(max, (groupCfg[key] || min) + delta))
}

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
    if (data._folder) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8"
             stroke-linecap="round" stroke-linejoin="round" width="42" height="42">
             <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`
    }
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
 * Build a spanning tree over the full displayed graph (BFS from the root), so
 * each displayed object hangs off one "parent". Every other link of the graph
 * (`graphEdges`) is still drawn later as a cross-link between any two visible
 * nodes.
 */
const buildTreeFromGraph = (rootId, nodesById, edges) => {
    const adj = new Map()
    const addAdj = (id, other, edge) => {
        if (!adj.has(id)) adj.set(id, [])
        adj.get(id).push({ other, edge })
    }
    for (const edge of edges || []) {
        if (!nodesById.has(edge.one_thing_id) || !nodesById.has(edge.other_thing_id)) continue
        addAdj(edge.one_thing_id, edge.other_thing_id, edge)
        addAdj(edge.other_thing_id, edge.one_thing_id, edge)
    }

    const makeNode = (meta, inLink) => {
        const cls = classOf(meta)
        const clsThing = cls || {}
        const node = {
            id: meta.thing_id,
            thing: meta,
            text: objectName(meta) || localizedClassName(cls) || t('Unnamed'),
            clsId: clsThing.thing_id || clsThing.id || null,
            clsName: localizedClassName(cls),
            clsColor: colorForClassId(clsThing.thing_id || clsThing.id || null),
            children: [],
        }
        if (inLink) node._inLink = inLink
        return node
    }

    const rootMeta = nodesById.get(rootId)
    if (!rootMeta) return null
    const root = makeNode(rootMeta)
    const seen = new Set([rootId])
    const queue = [root]
    while (queue.length) {
        const cur = queue.shift()
        for (const { other, edge } of adj.get(cur.id) || []) {
            if (seen.has(other)) continue
            seen.add(other)
            const meta = nodesById.get(other)
            if (!meta) continue
            const child = makeNode(meta, edge)
            cur.children.push(child)
            queue.push(child)
        }
    }
    return root
}

const linkLabel = (node) => {
    if (!node) return null
    const edge = node._inLink || node // a tree node wraps its edge; raw edges pass through
    if (!edge) return null
    return fieldText(edge.link_name, edge.link_name_translations) || null
}

const isCollapsed = (id) => collapsed.value.has(id)
const isFolderOpen = (key) => expandedGroups.value.has(key)

/** Buckets of one object's children: real children or foldable folders. */
const entriesOf = (treeNode) => {
    const children = treeNode.children || []
    if (!groupCfg.byType && !groupCfg.byClass) {
        return children.map((child) => ({ type: 'child', child }))
    }
    return foldChildren(children, {
        ownerId: treeNode.id,
        byType: groupCfg.byType,
        byClass: groupCfg.byClass,
        typeAbove: groupCfg.typeAbove,
        classAbove: groupCfg.classAbove,
        clutter: groupCfg.clutter,
        excludeClass: [UUID.HUMAN],
        typeOf: (c) => c?._inLink?.link_type_id ?? null,
        classOf: (c) => (c?.clsId && c.clsId !== UUID.HUMAN) ? c.clsId : null,
        typeLabel: (c) => linkLabel(c) || '',
        classLabel: (c) => c?.clsName || '',
    })
}

const baseJsonNode = (id, text, data) => ({
    id,
    text,
    nodeShape: 1,
    width: 120,
    height: 160,
    styleClass: 'rg-ghost',
    disableDefaultClickEffect: true,
    color: 'transparent',
    data,
})

/**
 * Flatten the visible part of the loaded tree into JsonNodes + labelled lines,
 * then add every remaining link of the full graph between visible nodes.
 */
const buildGraphJson = (root, allEdges = []) => {
    const nodes = []
    const lines = []
    const addLine = (from, to, text, groupKey) => {
        const line = { id: `${from}→${to}`, from, to, text: text ?? '', color: '#a7b1d6' }
        if (groupKey) line.groupKey = groupKey
        lines.push(line)
    }

    const visit = (treeNode) => {
        const nodeId = treeNode.id
        const { thing, _inLink: _link, children: _kids } = treeNode
        const { links: _links, ...thingData } = thing || {}
        const isCollapsedNode = isCollapsed(nodeId)
        nodes.push(baseJsonNode(nodeId, treeNode.text, {
            ...thingData,
            _clsId: treeNode.clsId,
            _clsName: treeNode.clsName,
            _clsColor: treeNode.clsColor,
            _hasChildren: (treeNode.children || []).length > 0,
            _collapsed: isCollapsedNode,
        }))
        if (isCollapsedNode) return
        for (const entry of entriesOf(treeNode)) {
            if (entry.type === 'child') {
                addLine(nodeId, entry.child.id, linkLabel(entry.child) || t('connected'))
                visit(entry.child)
                continue
            }
            // A folder is a small +/− circle; the relation/class name is shown
            // on the link itself so the node stays tiny and distinct.
            const open = isFolderOpen(entry.key)
            const folderLabel = entry.label || (entry.kind === 'type' ? t('Related') : t('Objects'))
            nodes.push({
                id: entry.key,
                text: '',
                nodeShape: 1,
                width: 44,
                height: 44,
                styleClass: 'rg-ghost',
                disableDefaultClickEffect: true,
                color: 'transparent',
                data: {
                    _folder: true,
                    _groupKey: entry.key,
                    _clsColor: '#6c757d',
                    _clsName: folderLabel,
                    _hasChildren: true,
                    _collapsed: !open,
                    _count: entry.items.length,
                },
            })
            addLine(nodeId, entry.key, `${folderLabel} · ${entry.items.length}`, entry.key)
            if (!open) continue
            for (const item of entry.items) {
                addLine(entry.key, item.id, '', entry.key)
                visit(item)
            }
        }
    }

    visit(root)

    // Every cross-link between two visible displayed objects that the spanning
    // tree did not already draw.
    const visible = new Set(nodes.map((n) => n.id))
    const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)
    const drawn = new Set(lines.map((l) => pairKey(l.from, l.to)))
    for (const edge of allEdges || []) {
        const a = edge.one_thing_id
        const b = edge.other_thing_id
        if (!a || !b || a === b) continue
        if (!visible.has(a) || !visible.has(b)) continue
        const key = pairKey(a, b)
        if (drawn.has(key)) continue
        drawn.add(key)
        lines.push({
            id: `x:${edge.link_id || key}`,
            from: a,
            to: b,
            text: linkLabel(edge) || t('connected'),
            color: '#8fa2d0',
        })
    }
    return { nodes, lines }
}

const isRootId = (id) => !!graphObject.value && id === graphObject.value.root_id
const isFolderNode = (node) => !!(node && node.data && node.data._folder)
const ringStyle = (node) => {
    if (node.data && node.data._folder) {
        return { borderColor: '#6c757d', background: '#f4f5f8' }
    }
    const color = (node.data && node.data._clsColor) || '#4a6bff'
    return { borderColor: color }
}

const fetchGraph = async (uid, depth) => {
    const { data } = await axios.get(`/object/${uid}/graph?depth=${depth}`)
    return data?.data ?? null
}

const renderGraph = async () => {
    if (!graphRef.value || !treeRoot.value) return
    const { nodes, lines } = buildGraphJson(treeRoot.value, graphEdges.value)
    if (nodes.length === 0) return
    await graphRef.value.setJsonData({
        rootId: graphObject.value.root_id,
        nodes,
        lines,
    })
}

const showGraph = async () => {
    if (!props.object) return
    graphObject.value = await fetchGraph(props.object.thing_id, selectedDepth.value)
    const nodesById = new Map((graphObject.value?.nodes || []).map((n) => [n.thing_id, n]))
    graphEdges.value = graphObject.value?.edges || []
    treeRoot.value = graphObject.value
        ? buildTreeFromGraph(graphObject.value.root_id, nodesById, graphEdges.value)
        : null
    collapsed.value = new Set()
    expandedGroups.value = new Set()
    await renderGraph()
}

/** Flip whether a group folder (packed same-type/same-class links) is open. */
const toggleGroup = (groupKey) => {
    if (!groupKey) return
    const next = new Set(expandedGroups.value)
    if (next.has(groupKey)) next.delete(groupKey)
    else next.add(groupKey)
    expandedGroups.value = next
    renderGraph()
}

/** Toggle a real node's loaded subtree or a group folder (the +/- button). */
const toggleNode = (node) => {
    const data = node && node.data
    if (!data) return
    if (data._folder && data._groupKey) {
        toggleGroup(data._groupKey)
        return
    }
    if (!data._hasChildren) return
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

/** Clicking a node: folders unfold/fold, object nodes open — unless dragged. */
const onNodeClickLocal = (node, e) => {
    const down = nodeDown.value
    nodeDown.value = null
    if (down && e && (Math.abs(e.clientX - down.x) > 5 || Math.abs(e.clientY - down.y) > 5)) {
        return // pointer moved: that was a drag, not a click
    }
    if (node && node.data && node.data._folder) {
        toggleNode(node)
        return
    }
    openObject(node)
}

/** Clicking a line that belongs to a group folds/unfolds that group. */
const onLineClick = (line) => {
    if (line && line.groupKey) toggleGroup(line.groupKey)
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

watch(groupCfg, () => {
    expandedGroups.value = new Set()
    if (treeRoot.value) renderGraph()
}, { deep: true })

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

/* Grouping folders are a small standalone +/− circle, clearly not an object. */
.rg-node.is-folder {
    width: 46px;
    height: 46px;
    justify-content: center;
}

.rg-folder {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
    color: #fff;
    background: #6c757d;
    border: 2px solid #fff;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    user-select: none;
    box-sizing: border-box;
    transition: transform 0.15s ease, background 0.15s ease;
    padding-bottom: 2px;
}

.rg-folder:hover {
    transform: scale(1.12);
}

.rg-folder.is-open {
    background: #4a6bff;
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

/* ------------------------------------------------------------------ */
/* Floating Levels/Group HUD panel (reference-demo style, hideable)    */
/* ------------------------------------------------------------------ */
.graph-wrap {
    position: relative;
}

.graph-canvas {
    width: 100%;
    height: 100%;
}

/* Floating panel: Levels head always shown; Group body folds away when mini */
.graph-hud {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 30;
    width: auto;
    max-width: min(340px, calc(100% - 24px));
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(0, 0, 0, 0.14);
    border-radius: 12px;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.16);
    padding: 8px 12px;
    font-size: 12px;
    color: #3d3f45;
    box-sizing: border-box;
}

.graph-hud.is-mini {
    padding: 6px 10px;
}

.graph-hud.is-mini .graph-hud-head {
    border-bottom: 0;
    padding-bottom: 0;
}

.graph-hud-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.graph-hud-head .btn-group .btn {
    font-size: 12px;
    line-height: 1.2;
    padding: 2px 8px;
}

/* Toggle: gear icon when the Group section is closed, × when open */
.graph-hud-toggle {
    margin-left: auto;
    width: 22px;
    height: 22px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #ced4da;
    background: #fff;
    border-radius: 50%;
    color: #4a6bff;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.graph-hud-toggle:hover {
    background: #4a6bff;
    border-color: #4a6bff;
    color: #fff;
}

.graph-hud-toggle svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
}

.graph-hud-toggle svg circle {
    fill: #fff;
    stroke: currentColor;
    stroke-width: 2;
}

.graph-hud-label {
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.08em;
    color: #7b828c;
    font-weight: 800;
    white-space: nowrap;
}

.graph-hud-body {
    padding-top: 8px;
}

.graph-hud-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 0;
}

.graph-hud-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 10px;
}

.graph-hud-check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    font-size: 12px;
    color: #3d3f45;
    cursor: pointer;
    white-space: nowrap;
}

.graph-hud-check input[type='checkbox'] {
    width: 13px;
    height: 13px;
    margin: 0;
    accent-color: #4a6bff;
    cursor: pointer;
}

.graph-hud-steppers {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 8px;
}

.graph-hud-stepper {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #7b828c;
    font-size: 11.5px;
    white-space: nowrap;
}

.graph-hud-num {
    display: inline-flex;
    align-items: center;
    gap: 2px;
}

.graph-hud-num button {
    width: 18px;
    height: 18px;
    padding: 0;
    line-height: 1;
    font-size: 13px;
    border: 1px solid #ced4da;
    background: #fff;
    border-radius: 50%;
    color: #3d3f45;
    cursor: pointer;
}

.graph-hud-num button:hover {
    background: #4a6bff;
    border-color: #4a6bff;
    color: #fff;
}

.graph-hud-num b {
    min-width: 24px;
    text-align: center;
    font-size: 12.5px;
    font-weight: 700;
    color: #3d3f45;
}

.graph-hud-hint {
    margin-top: 9px;
    padding-top: 7px;
    border-top: 1px dashed rgba(0, 0, 0, 0.14);
    color: #8a919a;
    font-size: 11.5px;
}
</style>
