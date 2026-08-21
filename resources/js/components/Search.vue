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
                                <div v-if="groupLabels[thingIndex]" class="date-group-header">
                                    <span class="date-group-line"></span>
                                    <span class="date-group-label">{{ groupLabels[thingIndex] }}</span>
                                    <span class="date-group-line"></span>
                                </div>
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
                                                {{ $flexibleDateFormatShort(thing.start, thing.end, thing.start_meta, thing.end_meta) }}
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
                                                <RelatedList :links="thing.links" :level="1" :on-expand="expandTarget" :parent="thing" />
                                            </div>
                                            <div v-else class="links-list">
                                                <div
                                                    v-for="(link, linkIndex) in thing.links.slice(0, 3)"
                                                    :key="`${link.link_type_id}-${linkIndex}`"
                                                    class="link-item"
                                                >
                                                    <LinkDescription :link="link" :object="thing" size="small" hide-object-name />
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

                                <!-- A group boundary already draws its own labeled
                                     separator line — don't stack a plain one on it. -->
                                <div v-if="thingIndex < objects.length - 1 && !groupLabels[thingIndex + 1]" class="result-separator"></div>
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import axios from 'axios';
import { eventBus } from "../eventBus";
import { useSearchStore } from '../stores/search';
import { useAuthStore } from '../stores/auth';
import { currentLocale } from '../utils/localized.js';
import { FlexibleDate } from '../utils/flexibleDate.js';
import Image from "./Image.vue";
import ImportModal from "./ImportModal.vue";
import ConfirmModal from './ConfirmModal.vue';
import RelatedList from "./RelatedList.vue";
import LinkDescription from "./LinkDescription.vue";
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

// ── Date-group delimiters (only meaningful when sorting by start date) ──────
function dateGroupKey(start) {
    if (!start) return null;
    // Decode via the canonical components so huge years (variable-length year
    // in the digit string) group under their real year, not its first 4 digits.
    const c = FlexibleDate.componentsFromCanonical(String(start));
    if (!c) return null;
    if (FlexibleDate.precisionFromValue(String(start)) === 'year') return 'y' + c.y;
    return 'm' + c.y + '-' + String(c.m).padStart(2, '0');
}

function dateGroupLabel(key) {
    if (!key) return null;
    if (key[0] === 'y') {
        const y = Number(key.slice(1));
        return y < 0 ? Math.abs(y) + ' ' + t('dates.bc') : String(y);
    }
    const m = key.match(/^m(-?\d+)-(\d{2})$/);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const locale = currentLocale();
    const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
        .format(new Date(Math.max(year, 0), parseInt(m[2], 10) - 1, 1));
    return year < 0 ? label + ' ' + t('dates.bc') : label;
}

// Header label aligned with each result row (null = no header before it).
const groupLabels = computed(() => {
    const labels = new Array(objects.value.length).fill(null);
    if (searchStore.sortBy !== 'start') return labels;
    let prevKey = null;
    objects.value.forEach((thing, i) => {
        const key = dateGroupKey(thing.start);
        if (key !== prevKey) {
            labels[i] = dateGroupLabel(key);
            prevKey = key;
        }
    });
    return labels;
});

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

// API exposes both endpoint names (link.name = other_thing_id,
// link.one_name = one_thing_id); pick the one matching the target.
const getOtherThingName = (link, currentThingId) => {
    const targetId = getOtherThingId(link, currentThingId);
    return targetId === link.one_thing_id ? (link.one_name || link.name) : (link.name || link.one_name);
};

const truncateText = (text, maxLength) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
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

// Monotonic request sequence: only the latest search request may apply its
// response. Search fires on mount (empty filter → everything, slow) and again
// once the class-tree default selection lands (filtered, fast). Without this
// guard the mount request's late response would overwrite the filtered results
// with the unfiltered list seconds later.
let searchRequestSeq = 0;

const getObjects = async () => {
    const requestId = ++searchRequestSeq;
    let type = [];
    if (searchStore.typeThing) type.push(3);
    if (searchStore.typeClass) type.push(2);

    // The class-tree filter only applies to objects: classes are linked to
    // their members (LINK_TO_CLASS), never the other way round, so without
    // a things-only type the selected class nodes themselves leak into the
    // results. When the tree selection is active we always search objects.
    if (searchStore.checkedItems.length > 0) {
        type = [3];
    }

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
        if (requestId !== searchRequestSeq) return; // stale response

        // A newer search superseded this one — its response will render instead.
        if (requestId !== searchRequestSeq) return;

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
        // Ignore failures from requests that were superseded by a newer search.
        if (requestId !== searchRequestSeq) return;
        console.error('Search.vue - Error:', error);
        if (error.response?.status === 422) {
            validationErrors.value = error.response.data.errors || {};
        }
        objects.value = [];
    } finally {
        // Only the latest request owns the processing/loaded flags.
        if (requestId !== searchRequestSeq) return;
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

<style scoped>
.date-group-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 14px 0 8px;
    color: #6c757d;
    font-size: 0.72rem;
    letter-spacing: 1px;
    text-transform: uppercase;
}

.date-group-line {
    flex: 1;
    height: 1px;
    background: #dee2e6;
}

.date-group-label {
    white-space: nowrap;
}
</style>
