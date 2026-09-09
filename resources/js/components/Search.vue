<template>
    <div id="search">
        <div v-if="!loaded" class="row">
            <div class="col text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">{{ $t('Loading...') }}</span>
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
                                <div v-if="dateDividers[thingIndex]" class="date-group-header" :class="{ 'future-divider': dateDividers[thingIndex].future, 'past-divider': dateDividers[thingIndex].center?.kind === 'past' }">
                                    <span v-if="dateDividers[thingIndex].bucket" class="date-group-date">
                                        📅 {{ $flexibleDateFormatShort(thing.start, thing.end, thing.start_meta, thing.end_meta) }}
                                    </span>
                                    <span class="date-group-line"></span>
                                    <template v-if="dateDividers[thingIndex].center">
                                        <span class="date-group-label">
                                            <template v-if="dateDividers[thingIndex].center.kind === 'month'">{{ dateDividers[thingIndex].center.label }}</template>
                                            <template v-else-if="dateDividers[thingIndex].center.kind === 'future_in'">{{ $t('dates.future_in', { date: dateDividers[thingIndex].center.label }) }}</template>
                                            <template v-else>{{ $t('dates.past') }}</template>
                                        </span>
                                        <span class="date-group-line"></span>
                                    </template>
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

                                        <div v-for="cls in $getClassesList(thing)" :key="cls.thing_id" class="class-badge">
                                            <Image :node-id="cls.thing_id" width="12px" class="class-badge-icon" />
                                            <RouterLink :to="{ name: 'object', params: { uid: cls.thing_id } }" class="class-badge-link">
                                                {{ $objectName(cls) }}
                                            </RouterLink>
                                        </div>

                                        <!-- Dates inline on the first line of the description -->
                                        <div
                                            v-if="thing.start || thing.end || thing.description"
                                            class="result-description"
                                        >
                                            
        <span v-if="thing.start || thing.end" class="inline-date" style="margin-right: 8px;">
                                                <template v-if="!dateDividersActive">
                                                    📅
                                                    {{ $flexibleDateFormatShort(thing.start, thing.end, thing.start_meta, thing.end_meta) }}
                                                </template>
                                                <span v-if="isOngoing(thing)" class="ongoing-badge">{{ $t('dates.ongoing') }}</span>
                                                <span
                                                    v-if="isOverduePlan(thing)"
                                                    class="unconfirmed-badge"
                                                >
                                                    {{ $t('dates.not_confirmed') }}
                                                    <template v-if="thing.data?.planned">({{ thing.data.planned }})</template>
                                                </span>
                                                <span
                                                    v-else-if="isPlanned(thing)"
                                                    class="planned-badge"
                                                >
                                                    {{ $t('dates.planned') }}
                                                    <template v-if="thing.data?.planned">({{ thing.data.planned }})</template>
                                                </span>
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
                                <div v-if="thingIndex < objects.length - 1 && !dateDividers[thingIndex + 1]" class="result-separator"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

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
import { eventBus } from "@factology/engine/eventBus.js";
import { useSearchStore } from '../stores/search';
import { useAuthStore } from '../stores/auth';
import { currentLocale } from '../utils/localized.js';
import { FlexibleDate } from '@factology/engine/utils/flexibleDate.js';
import { dateBucket } from '../utils/dateGroupings.js';
import Image from "./Image.vue";
import ConfirmModal from './ConfirmModal.vue';
import RelatedList from "./RelatedList.vue";
import LinkDescription from "./LinkDescription.vue";
import { useRelatedExpansion } from "../composables/useRelatedExpansion";

// ── Date helpers ────────────────────────────────────────────────────────
// Canonical "now" for date comparison (same format as the DB stores).
function canonicalNow() {
    const d = new Date();
    const y = d.getFullYear();
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${y}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Whether the thing's start date is strictly in the future.
function isFutureDate(thing) {
    if (!thing.start) return false;
    return BigInt(String(thing.start)) > BigInt(canonicalNow());
}

// Whether the thing is happening right now (start ≤ now ≤ end).
function isOngoing(thing) {
    if (!thing.start) return false;
    const now = BigInt(canonicalNow());
    if (now < BigInt(String(thing.start))) return false;
    if (!thing.end) return false;
    return now <= BigInt(String(thing.end));
}

// A "plan" is an object with a future start date that hasn't been confirmed
// yet. Explicitly-marked plans (data.planned) count even after their date
// passes; unmarked future-dated objects are derived as plans from their start.
function isPlanned(thing) {
    if (thing.data?.confirmed) return false;
    if (thing.data?.planned) return true;
    return isFutureDate(thing);
}

// An explicitly-marked plan whose date has already passed without being
// confirmed. Such rows belong in the past section and read "not confirmed"
// (amber) instead of "planned", prompting the owner to act. Without a start
// date there is nothing to judge as passed, so those stay "planned".
function isOverduePlan(thing) {
    if (thing.data?.confirmed) return false;
    if (!thing.data?.planned) return false;
    if (!thing.start) return false;
    return !isFutureDate(thing);
}

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
// Each divider line carries the date of the first object in its group on the
// left — so the per-object date row can be dropped — and, on the first divider
// of a month, the month/year label centered. See utils/dateGroupings.js.
function dateGroupMonthLabel(coarseKey) {
    if (!coarseKey) return null;
    if (coarseKey[0] === 'y') {
        const y = Number(coarseKey.slice(1));
        return y < 0 ? Math.abs(y) + ' ' + t('dates.bc') : String(y);
    }
    const m = coarseKey.match(/^m(-?\d+)-(\d{2})$/);
    if (!m) return null;
    const year = parseInt(m[1], 10);
    const locale = currentLocale();
    const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
        .format(new Date(Math.max(year, 0), parseInt(m[2], 10) - 1, 1));
    return year < 0 ? label + ' ' + t('dates.bc') : label;
}

// Per-row divider descriptor (null = no divider before this row). Dividers
// appear at every date-group boundary. The centered label — "<Month Year>"
// for past groups, "planned in <Month Year>" for future ones — appears only
// on the first divider of each month, so a month is announced once above all
// of its events. The past/future seam divider instead centers a bold "Past".
const dateDividers = computed(() => {
    const dividers = new Array(objects.value.length).fill(null);
    if (searchStore.sortBy !== 'start') return dividers;
    let lastBucket = null;
    let lastCoarse = null;
    let lastFuture = null;
    objects.value.forEach((thing, i) => {
        const future = isFutureDate(thing);
        const bucket = dateBucket(thing.start);
        // Boundary between the future and past sections — place the divider at
        // the start of the second section, whichever sort direction is active.
        if (lastFuture !== null && future !== lastFuture) {
            dividers[i] = {
                future,
                bucket,
                center: future
                    ? { kind: 'future_in', label: dateGroupMonthLabel(bucket ? bucket.coarse : null) }
                    : { kind: 'past' },
            };
            lastFuture = future;
            lastBucket = bucket ? bucket.key : null;
            lastCoarse = bucket ? bucket.coarse : null;
            return;
        }
        lastFuture = future;
        if (!bucket) return;
        const newBucket = bucket.key !== lastBucket;
        const firstOfMonth = bucket.coarse !== lastCoarse;
        if (!newBucket && !firstOfMonth) return;
        let center = null;
        if (firstOfMonth) {
            // Only the first divider of a month gets the centered label, so a
            // month reads once ("planned in <Month Year>" for future months,
            // "<Month Year>" for past ones) above all its events.
            center = future
                ? { kind: 'future_in', label: dateGroupMonthLabel(bucket.coarse) }
                : { kind: 'month', label: dateGroupMonthLabel(bucket.coarse) };
        }
        dividers[i] = { future, bucket, center };
        lastBucket = bucket.key;
        lastCoarse = bucket.coarse;
    });
    return dividers;
});

// When date-sorted, each object's date lives on its group divider, so the
// cards stop repeating it.
const dateDividersActive = computed(() => searchStore.sortBy === 'start');

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
/* Tighter vertical rhythm for the date-sorted timeline than the generic
   list (kept local to this page, not the shared app.css rule). */
.result-item {
    padding: 0.5rem 0;
}

/* Image.vue centers its contents inside the 48px wrapper, so when the
   thumbnail also carries a right icon bar (48px img + 6px gap + 18px bar)
   the picture overflows 12px to the LEFT of the row. Pin the picture to the
   wrapper's start so it lines up with the date dividers at the list edge;
   the icon bar then sits in the gutter before the text column. */
.result-icon-section .image-wrapper {
    justify-content: flex-start;
    gap: 0 !important; /* Image.vue inlines gap: 6px; only !important beats it */
}

.date-group-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 6px 0 3px;
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

/* The object date sits at the start of the divider line (not uppercased or
   letter-spaced like the centered month label). */
.date-group-date {
    white-space: nowrap;
    font-weight: 600;
    text-transform: none;
    letter-spacing: normal;
}

.future-divider {
    margin: 10px 0 5px;
}
.future-divider .date-group-label {
    color: #0d6efd;
    font-weight: 700;
}
.future-divider .date-group-line {
    background: #0d6efd;
    opacity: 0.4;
}

/* The past/future seam must read at least as strongly as the "planned"
   dividers above it — bold dark label plus a distinct, solid line. */
.past-divider .date-group-label {
    color: #212529;
    font-weight: 800;
    letter-spacing: 1.5px;
}
.past-divider .date-group-line {
    background: #495057;
    height: 2px;
}
.ongoing-badge {
    display: inline-block;
    font-size: 0.6rem;
    font-weight: 700;
    color: #fff;
    background: #198754;
    padding: 1px 6px;
    border-radius: 3px;
    margin-left: 4px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    vertical-align: middle;
}
.planned-badge {
    display: inline-block;
    font-size: 0.6rem;
    font-weight: 700;
    color: #0d6efd;
    background: rgba(13, 110, 253, 0.1);
    border: 1px solid rgba(13, 110, 253, 0.3);
    padding: 1px 6px;
    border-radius: 3px;
    margin-left: 4px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    vertical-align: middle;
}
/* Past plans that were never confirmed need attention — amber warning badge
   instead of the blue "planned" one. */
.unconfirmed-badge {
    display: inline-block;
    font-size: 0.6rem;
    font-weight: 700;
    color: #b45309;
    background: rgba(245, 158, 11, 0.14);
    border: 1px solid rgba(245, 158, 11, 0.45);
    padding: 1px 6px;
    border-radius: 3px;
    margin-left: 4px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    vertical-align: middle;
}
</style>
