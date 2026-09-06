<template>
    <div class="object-view-sidebar">
        <!-- Header: title + the shared level (depth) selector -->
        <div class="sidebar-header">
            <div class="sidebar-title">{{ t('Related objects') }}</div>
            <div class="level-row d-flex align-items-center gap-2">
                <span class="small text-muted">{{ t('Levels') }}</span>
                <div class="btn-group btn-group-sm" role="group" aria-label="Related levels">
                    <button
                        v-for="lvl in LEVELS"
                        :key="lvl"
                        type="button"
                        class="btn level-btn"
                        :class="viewStore.depth === lvl ? 'btn-primary' : 'btn-outline-secondary'"
                        :data-testid="`level-${lvl}`"
                        @click="viewStore.setDepth(lvl)"
                    >{{ lvl }}</button>
                </div>
            </div>
        </div>

        <div class="sidebar-sub">
            <button
                v-if="!allChecked"
                type="button"
                class="btn btn-link btn-sm p-0 clear-btn"
                data-testid="show-all-filters"
                @click="checkAll"
            >{{ t('Show all') }}</button>
        </div>

        <!-- Loading -->
        <div v-if="loadingNeighborhood" class="sidebar-hint">
            <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
        </div>

        <!-- Taxonomy not ready yet -->
        <div v-else-if="taxonomyLoading && !treeData.length" class="sidebar-hint text-muted">
            {{ t('Loading classes…') }}
        </div>

        <!-- No data / error -->
        <div v-else-if="loadError" class="sidebar-hint text-muted">
            {{ t('No related objects available') }}
        </div>

        <!-- Nothing to filter -->
        <div v-else-if="!treeData.length" class="sidebar-hint text-muted">
            {{ t('No related classes or link types') }}
        </div>

        <!-- Filter tree -->
        <div v-else class="of-tree" data-testid="object-filter-tree">
            <ObjectFilterItem
                v-for="root in treeData"
                :key="root.id"
                :node="root"
                :depth="0"
                :checked-ids="viewStore.checkedIds"
                @change="onToggle"
            />
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import axios from 'axios';
import { useObjectsStore } from '@/stores/objects';
import { useObjectViewStore } from '@/stores/objectView';
import { collectSubtreeIds, nodeSelectionState, pruneEmptyNodes } from '@/utils/classTree';
import {
    collectNeighborhoodStats,
    pruneTaxonomy,
    topLevelTaxonomyNodes,
} from '@/utils/relatedFilters';
import { LINK_TYPE } from '@/constants.js';
import { eventBus } from '@/eventBus';
import ObjectFilterItem from './ObjectFilterItem.vue';

const LEVELS = [1, 2, 3, 4];

const route = useRoute();
const viewStore = useObjectViewStore();
const objectsStore = useObjectsStore();
const { t } = useI18n();

const uid = computed(() => route.params?.uid || null);

// The neighborhood (GET /object/{uid}?depth=N) defines which classes and link
// types are offered. Fetched by this panel; Graph/Details consume the
// resulting filters through the store.
const loadingNeighborhood = ref(false);
const loadError = ref(false);
const stats = ref({
    classIds: new Set(),
    linkTypeIds: new Set(),
    classCounts: new Map(),
    linkTypeCounts: new Map(),
});

const emptyStats = () => ({
    classIds: new Set(),
    linkTypeIds: new Set(),
    classCounts: new Map(),
    linkTypeCounts: new Map(),
});

// Every class id / link type id that occurs in the current neighborhood.
const availableIds = computed(() => [
    ...stats.value.classCounts.keys(),
    ...stats.value.linkTypeCounts.keys(),
]);

// Full set of checked ids and the ids already offered in a previous
// neighborhood live in the objectView store, so the user's checked/unchecked
// tree survives moving between object pages (the sidebar stays mounted) and
// even a sidebar remount. Newly appearing classes/link types default to
// checked; ids the user unchecks stay unchecked everywhere.
const allChecked = computed(() =>
    availableIds.value.every((id) => viewStore.checkedIds.includes(id))
);

let requestSeq = 0;
async function loadNeighborhood() {
    if (!uid.value) {
        stats.value = emptyStats();
        return;
    }
    const seq = ++requestSeq;
    loadingNeighborhood.value = true;
    loadError.value = false;
    try {
        const { data } = await axios.get(`/object/${uid.value}?depth=${viewStore.depth}`);
        if (seq !== requestSeq) return;
        const obj = data?.data ?? null;
        stats.value = obj ? collectNeighborhoodStats(obj) : emptyStats();
        // New classes/link types default to checked ("see everything").
        acceptNewAvailable();
        pushFilters();
    } catch (error) {
        if (seq !== requestSeq) return;
        stats.value = emptyStats();
        loadError.value = true;
        console.error('ObjectViewSidebar - failed to load neighborhood:', error);
    } finally {
        if (seq === requestSeq) loadingNeighborhood.value = false;
    }
}

// The effective filter ids: only checked ids that actually label an object
// class (resp. a link type) in this neighborhood restrict anything.
function pushFilters() {
    viewStore.setFilters(
        viewStore.checkedIds.filter((id) => stats.value.classCounts.has(id)),
        viewStore.checkedIds.filter((id) => stats.value.linkTypeCounts.has(id))
    );
}

// Check every offered class/link type (the default view and the "Show all"
// action). Removed ids stay removed on later depth/object changes.
function acceptNewAvailable() {
    const seen = viewStore.seenIds;
    const newly = availableIds.value.filter((id) => !seen.has(id));
    if (!newly.length) return;
    for (const id of newly) seen.add(id);
    viewStore.checkedIds = [...new Set([...viewStore.checkedIds, ...newly])];
}

function checkAll() {
    for (const id of availableIds.value) viewStore.seenIds.add(id);
    viewStore.checkedIds = [...availableIds.value];
    pushFilters();
}

function onToggle(node) {
    const subtreeIds = [node.id, ...collectSubtreeIds(node.nodes || [])];
    const state = nodeSelectionState(node.id, node.nodes || [], viewStore.checkedIds);
    if (state === 'semi') {
        // Clicking an indeterminate node selects the whole subtree (like the
        // search tree).
        viewStore.checkedIds = [...new Set([...viewStore.checkedIds, ...subtreeIds])];
    } else if (state === 'checked') {
        const remove = new Set(subtreeIds);
        viewStore.checkedIds = viewStore.checkedIds.filter((id) => !remove.has(id));
        // Drop category ids whose last selected descendant was just removed,
        // mirroring the search tree's ancestor pruning.
        viewStore.checkedIds = pruneEmptyNodes(topLevelTaxonomyNodes(objectsStore.rootNodes), viewStore.checkedIds);
    } else {
        viewStore.checkedIds = [...new Set([...viewStore.checkedIds, ...subtreeIds])];
    }
    pushFilters();
}

// ─── Tree data ─────────────────────────────────────────────────────────────
const usedIds = computed(() => new Set([...stats.value.classIds, ...stats.value.linkTypeIds]));

// Counts badge: a class/link-type node with direct occurrences shows how many
// objects (resp. links) of that kind are in the neighborhood. Enriched on the
// pruned copies so the source store tree is never mutated.
function enrichCounts(nodes) {
    for (const node of nodes || []) {
        const counts = node.type === LINK_TYPE ? stats.value.linkTypeCounts : stats.value.classCounts;
        node.count = counts.get(node.id) || 0;
        if (node.nodes && node.nodes.length) enrichCounts(node.nodes);
    }
}

const treeData = computed(() => {
    const tops = topLevelTaxonomyNodes(objectsStore.rootNodes || []);
    const pruned = pruneTaxonomy(tops, usedIds.value);
    enrichCounts(pruned);
    return pruned;
});

const taxonomyLoading = computed(() => objectsStore.loading);

function ensureTaxonomy() {
    if (!objectsStore.rootNodes || objectsStore.rootNodes.length === 0) {
        // autoSelect:false so merely opening an object page never changes the
        // dashboard's default Event pre-selection.
        objectsStore.loadClassTree(null, null, { autoSelect: false });
    }
}

function onDetailsChanged() {
    if (uid.value) loadNeighborhood();
}

watch(uid, (value) => {
    viewStore.setUid(value);
    // Note: do NOT clear checkedIds/seenIds here — the checked/unchecked tree
    // is a user preference that must survive object-to-object navigation.
    loadNeighborhood();
}, { immediate: true });

watch(() => viewStore.depth, () => {
    if (uid.value) loadNeighborhood();
});

onMounted(() => {
    ensureTaxonomy();
    eventBus.on('object-details-changed', onDetailsChanged);
});

onUnmounted(() => {
    eventBus.off('object-details-changed', onDetailsChanged);
});
</script>

<style scoped>
.object-view-sidebar {
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.sidebar-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e9ecef;
}
.sidebar-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: #343a40;
}
.sidebar-sub {
    min-height: 22px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.filter-badge {
    font-size: 0.68rem;
}
.clear-btn {
    font-size: 0.75rem;
    color: #0d6efd;
    text-decoration: none;
}
.clear-btn:hover {
    text-decoration: underline;
}
.sidebar-hint {
    font-size: 0.78rem;
    padding: 8px 0;
    color: #6c757d;
    display: flex;
    align-items: center;
    gap: 6px;
}
.level-row .btn {
    --bs-btn-padding-y: 0.125rem;
    --bs-btn-padding-x: 0.5rem;
    font-size: 0.75rem;
    line-height: 1.3;
}
.of-tree {
    padding-right: 2px;
}
</style>
