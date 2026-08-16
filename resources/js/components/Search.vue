<template>
    <div id="search">
        <div v-if="!loaded" class="row">
            <div class="col text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">{{ $t('Loading...') }}</span>
                </div>
            </div>
        </div>
        <!-- Admin toolbar: Export / Import -->
        <div v-if="authStore.user?.is_admin" class="row mb-2">
            <div class="col-md-10 offset-md-1">
                <div class="admin-toolbar d-flex gap-2 align-items-center">
                    <button class="btn btn-outline-secondary btn-sm" @click="exportData" :disabled="exporting">
                        {{ exporting ? $t('Exporting...') : $t('Export') }}
                    </button>
                    <button class="btn btn-outline-secondary btn-sm" @click="showImportModal = true">
                        {{ $t('Import') }}
                    </button>
                    <label class="small text-muted mb-0 ms-2">
                        <input type="checkbox" v-model="includeDeleted" />
                        {{ $t('Include deleted') }}
                    </label>
                </div>
            </div>
        </div>

        <div v-if="loaded && objects.length === 0" class="row">
            <div class="col text-center py-5">
                <p class="text-muted">{{ $t('No results found') }}</p>
            </div>
        </div>
        <div v-if="loaded && objects.length > 0" class="row">
            <div class="col">
                <div class="row mt-3">
                    <div class="col-md-10 offset-md-1">
                        <div class="results-list">
                            <div
                                v-for="(thing, thingIndex) in objects"
                                :key="`${thing.thing_id}-${thingIndex}`"
                                class="result-item"
                            >
                                <div class="result-content">
                                    <!-- LEFT: icon only -->
                                    <div class="result-icon-section">
                                        <RouterLink :to="{ name: 'object', params: { uid: thing.thing_id } }" class="icon-link">
                                            <Image
                                                :node-id="thing.thing_id"
                                                :type="thing.type"
                                                :is-private="!thing.public"
                                                :authenticated="authStore?.authenticated"
                                                width="48px"
                                                side-bar="right"
                                            />
                                        </RouterLink>
                                    </div>

                                    <!-- MIDDLE: name, then dates inline with description -->
                                    <div class="result-info-section">
                                        <div class="result-header">
                                            <div class="result-title">
                                                <RouterLink :to="{ name: 'object', params: { uid: thing.thing_id } }" class="title-link">
                                                    {{ $objectName(thing) }}
                                                </RouterLink>
                                            </div>
                                        </div>

                                        <div v-if="thing.type === 3 && thing.class" class="class-badge">
                                            <Image :node-id="thing.class.thing_id" width="12px" class="class-badge-icon" />
                                            <RouterLink :to="{ name: 'object', params: { uid: thing.class.thing_id } }" class="class-badge-link">
                                                {{ $objectName(thing.class) }}
                                            </RouterLink>
                                        </div>

                                        <!-- Dates inline on the first line of the description -->
                                        <div
                                            v-if="thing.start || thing.end || thing.description"
                                            class="result-description"
                                        >
                                            
        <span v-if="thing.start || thing.end" class="inline-date" style="margin-right: 8px;">

                                                📅
                                                <template v-if="thing.start">{{ formatDateShort(thing.start) }}</template>
                                                <template v-if="thing.start && thing.end"> → </template>
                                                <template v-else-if="thing.end">{{ $t('until') }} </template>
                                                <template v-if="thing.end">{{ formatDateShort(thing.end) }}</template>
                                            </span>
                                            <span v-if="$objectDescription(thing)">{{ truncateText($objectDescription(thing), 120) }}</span>
                                        </div>
                                    </div>

                                    <!-- RIGHT: links (optional, shrinks when empty) -->
                                    <div
                                        v-if="thing.links && thing.links.length > 0"
                                        class="result-links-section"
                                    >
                                        <div class="links-container">
                                            <div class="links-title">
                                                <span>🔗 Related</span>
                                                <span class="links-count">({{ thing.links.length }})</span>
                                            </div>
                                            <div v-if="shownAll.has(thing.thing_id)" class="links-list">
                                                <RelatedList :links="thing.links" :level="1" :on-expand="expandTarget" />
                                            </div>
                                            <div v-else class="links-list">
                                                <div
                                                    v-for="(link, linkIndex) in thing.links.slice(0, 3)"
                                                    :key="`${link.link_type_id}-${linkIndex}`"
                                                    class="link-item"
                                                >
                                                    <RouterLink :to="{ name: 'object', params: { uid: link.link_type_id } }" class="link-type-icon">
                                                        <Image :node-id="link.link_type_id" width="14px" />
                                                    </RouterLink>
                                                    <span class="link-arrow">→</span>
                                                    <RouterLink :to="{ name: 'object', params: { uid: getOtherThingId(link, thing.thing_id) } }" class="link-target">
                                                        <Image :node-id="getOtherThingId(link, thing.thing_id)" width="14px" class="link-icon" />
                                                        <span class="link-name">{{ truncateText(link.name || 'Related', 30) }}</span>
                                                    </RouterLink>
                                                </div>
                                                <button
                                                    v-if="thing.links.length > 3"
                                                    class="more-links"
                                                    type="button"
                                                    @click="toggleShowAll(thing.thing_id)"
                                                >
                                                    +{{ thing.links.length - 3 }} more
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div v-if="thingIndex < objects.length - 1" class="result-separator"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <ImportModal v-if="showImportModal" @close="showImportModal = false" />
        <ConfirmModal
            :show="showConfirmModal"
            :title="confirmTitle"
            :message="confirmMessage"
            :confirm-text="confirmButtonText"
            :variant="confirmVariant"
            @confirm="handleToggleConfirm"
            @cancel="showConfirmModal = false"
        />
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import axios from 'axios';
import { eventBus } from "../eventBus";
import { useSearchStore } from '../stores/search';
import { useAuthStore } from '../stores/auth';
import Image from "./Image.vue";
import ImportModal from "./ImportModal.vue";
import ConfirmModal from './ConfirmModal.vue';
import RelatedList from "./RelatedList.vue";
import { useRelatedExpansion } from "../composables/useRelatedExpansion";

const props = defineProps({
    searchText: String,
    typeThing: String,
    typeClass: String
});

defineOptions({ name: "Search" });

const route = useRoute();
const { t } = useI18n();
const searchStore = useSearchStore();
const authStore = useAuthStore();

const objects = ref([]);
const loaded = ref(false);
const validationErrors = ref({});
const processing = ref(false);

const { loadDeeper } = useRelatedExpansion();

// Per-result unfold state for the Related panel ("+N more" → show all direct links).
const shownAll = ref(new Set());
const toggleShowAll = (thingId) => {
    const set = new Set(shownAll.value);
    if (set.has(thingId)) {
        set.delete(thingId);
    } else {
        set.add(thingId);
    }
    shownAll.value = set;
};

// Load one more level of related objects for a link target on demand.
const expandTarget = async (link) => {
    const targetId = link.target?.thing_id;
    if (!targetId) return;
    try {
        link.target.links = await loadDeeper(targetId, 1);
    } catch (error) {
        console.error('Search.vue - failed to load deeper related objects:', error);
    }
};

// Filter param keys for URL sync
const filterKeys = ['sort', 'order', 'visibility', 'date_from', 'date_to', 'owner', 'server'];

// ─── Quick visibility toggle state ─────────────────────────────────
let quickMode = false;
const showConfirmModal = ref(false);
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmButtonText = ref('');
const confirmVariant = ref('primary');
let pendingToggle = null;

const handleToggleVisibility = (thingId, thingIndex) => {
    const thing = objects.value[thingIndex];
    if (!thing) return;
    const makePublic = !thing.public;
    const doToggle = () => {
        axios.patch(`/object/${thingId}/visibility`, { public: makePublic ? 1 : 0 }).then(() => {
            thing.public = makePublic ? 1 : 0;
        }).catch((error) => {
            console.error('Failed to toggle visibility:', error);
        });
    };
    if (quickMode) {
        doToggle();
        return;
    }
    if (makePublic) {
        confirmTitle.value = t('Make Public');
        confirmMessage.value = t('Make this object visible to everyone? Anyone will be able to see it.');
        confirmButtonText.value = t('Make Public');
        confirmVariant.value = 'success';
    } else {
        confirmTitle.value = t('Make Private');
        confirmMessage.value = t('Make this object private? Only you will be able to see it.');
        confirmButtonText.value = t('Make Private');
        confirmVariant.value = 'danger';
    }
    pendingToggle = doToggle;
    showConfirmModal.value = true;
};

const handleToggleConfirm = () => {
    showConfirmModal.value = false;
    if (!pendingToggle) return;
    const fn = pendingToggle;
    pendingToggle = null;
    quickMode = true;
    fn();
};

// Export/Import state
const exporting = ref(false);
const includeDeleted = ref(false);
const showImportModal = ref(false);

if (props.typeThing !== undefined && props.typeThing !== null) {
    searchStore.setTypeThing(props.typeThing === 'true' || props.typeThing === true);
}
if (props.typeClass !== undefined && props.typeClass !== null) {
    searchStore.setTypeClass(props.typeClass === 'true' || props.typeClass === true);
}

const getOtherThingId = (link, currentThingId) => {
    const thingId = link.thing_id || link.one_thing_id;
    return thingId === currentThingId ? link.other_thing_id : thingId;
};

const truncateText = (text, maxLength) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
};

const formatDateShort = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' });
};

const exportData = async () => {
    exporting.value = true;
    try {
        const response = await axios.get('/export', {
            params: { include_deleted: includeDeleted.value },
            responseType: 'blob',
        });

        // Trigger browser download using raw blob (avoids double-encoding)
        const blob = new Blob([response.data], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `factology-export-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Export failed:', error);
        alert('Export failed: ' + (error.response?.data?.message || error.message));
    } finally {
        exporting.value = false;
    }
};

const getObjects = async () => {
    const type = [];
    if (searchStore.typeThing) type.push(3);
    if (searchStore.typeClass) type.push(2);

    processing.value = true;
    loaded.value = false;

    try {
        const searchQuery = searchStore.searchQuery || props.searchText || route.query.q || '';

        // Build filter params from URL/store
        const body = {
            search: searchQuery,
            type: type,
            classes: searchStore.checkedItems,
        };

        // Read filter params from URL (or store defaults)
        const filterParams = ['sort', 'order', 'visibility', 'date_from', 'date_to', 'owner', 'server'];
        const paramMap = {
            sort: 'sort_by',
            order: 'sort_order',
        };
        for (const key of filterParams) {
            const val = route.query[key];
            if (val) {
                body[paramMap[key] || key] = val;
            }
        }

        const response = await axios.post('/object', body);

        validationErrors.value = {};

        if (typeof response.data === 'string') {
            try {
                const parsed = JSON.parse(response.data);
                objects.value = parsed.things || [];
            } catch (e) {
                console.error('Search.vue - Failed to parse response:', e);
                objects.value = [];
            }
        } else {
            objects.value = response.data.things || response.data || [];
        }
    } catch (error) {
        console.error('Search.vue - Error:', error);
        if (error.response?.status === 422) {
            validationErrors.value = error.response.data.errors || {};
        }
        objects.value = [];
    } finally {
        processing.value = false;
        loaded.value = true;
    }
};

const triggerSearchHandler = () => { getObjects(); };

// Sync filter params from URL to store
const syncFiltersFromRoute = () => {
    const q = route.query.q;
    searchStore.setSearchQuery(q || '');
    // Only sync filter params on actual route changes (not on our own pushes)
    const filterKeys = ['sort', 'order', 'visibility', 'date_from', 'date_to', 'owner', 'server'];
    for (const key of filterKeys) {
        const val = route.query[key];
        if (val !== undefined) {
            searchStore.setFilter(key, val);
        }
    }
};

watch(() => route.query, (newQuery, oldQuery) => {
    const qChanged = newQuery.q !== oldQuery.q;
    const filtersChanged = filterKeys.some(k => newQuery[k] !== oldQuery[k]);
    if (qChanged || filtersChanged) {
        syncFiltersFromRoute();
        if (qChanged || filtersChanged) {
            getObjects();
        }
    }
}, { deep: true });

watch(() => searchStore.checkedItems, () => {
    getObjects();
}, {deep: true});

onMounted(() => {
    eventBus.on('trigger-search', triggerSearchHandler);
    syncFiltersFromRoute();
    getObjects();
});

onUnmounted(() => {
    eventBus.off('trigger-search', triggerSearchHandler);
});
</script>
