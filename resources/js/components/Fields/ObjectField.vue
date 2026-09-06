<!-- Universal component to fill UUID for any type of object or link -->
<template>
    <div class="object-field">
        <label v-if="label" class="form-label">
            {{ label }}
            <small v-if="name">({{ name }})</small>
        </label>

        <div v-if="!isEditable" class="form-control-plaintext d-flex align-items-center gap-2 py-1">
            <IconClass v-if="selectedObject?.type === CLASS_TYPE" class="flex-shrink-0" width="1.4em" height="1.4em" />
            <IconThing v-else-if="selectedObject?.type === THING_TYPE" class="flex-shrink-0" width="1.4em" height="1.4em" />
            <IconLink v-else-if="selectedObject?.type === LINK_TYPE" class="flex-shrink-0" width="1.4em" height="1.4em" />
            <span v-if="displayValue">{{ displayValue }}</span>
            <span v-else class="text-muted fst-italic">—</span>
            <small v-if="selectedObject?.subtitle" class="text-muted ms-2">
                {{ selectedObject.subtitle }}
            </small>
        </div>

        <template v-else>
            <div ref="wrapperRef" class="position-relative w-100">
                <div class="input-group input-group-sm w-100" :class="{ 'is-invalid': error }">
                    <span class="input-group-text bg-light">
                        <IconClass v-if="selectedObject?.type === CLASS_TYPE" width="1.3em" height="1.3em" />
                        <IconThing v-else-if="selectedObject?.type === THING_TYPE" width="1.3em" height="1.3em" />
                        <IconLink v-else-if="selectedObject?.type === LINK_TYPE" width="1.3em" height="1.3em" />
                        <IconUser v-else width="1.3em" height="1.3em" />
                    </span>

                    <div
                        v-if="multiple"
                        class="form-control chips-container"
                        :data-field-name="fieldName"
                        @click="openDropdown"
                    >
                        <span v-for="obj in selectedObjects" :key="obj.thing_id" class="chip" :data-test-name="obj.name">
                            {{ objectName(obj) || obj.thing_id }}
                            <button
                                type="button"
                                class="chip-remove"
                                :title="$t('Remove')"
                                @click.stop="removeObject(obj.thing_id)"
                            >
                                <IconClose width="10" height="10" />
                            </button>
                        </span>
                        <input
                            ref="inputRef"
                            type="text"
                            class="chip-input"
                            :value="isOpen ? searchText : ''"
                            :placeholder="isOpen || selectedObjects.length === 0 ? placeholder : ''"
                            @focus="openDropdown"
                            @input="onInput"
                            @keydown.esc="closeDropdown"
                        />
                    </div>

                    <input
                        v-else
                        ref="inputRef"
                        type="text"
                        class="form-control"
                        :data-field-name="fieldName"
                        :value="isOpen ? searchText : displayValue"
                        :readonly="!isOpen"
                        :placeholder="isOpen ? placeholder : (displayValue || placeholder)"
                        @focus="openDropdown"
                        @input="onInput"
                        @click="openDropdown"
                        @keydown.esc="closeDropdown"
                    />

                    <button
                        v-if="allowClear && (multiple ? selectedObjects.length > 0 : modelValue)"
                        class="btn btn-outline-secondary"
                        type="button"
                        @click.stop="clearSelection"
                        :title="$t('Clear selection')"
                    >
                        <IconClose width="14" height="14" />
                    </button>

                    <button
                        class="btn btn-outline-secondary"
                        type="button"
                        @click="isOpen ? closeDropdown() : openDropdown()"
                        :title="isOpen ? $t('Close') : $t('Select object')"
                    >
                        <IconChevronUp v-if="isOpen" width="14" height="14" />
                        <IconChevronDown v-else width="14" height="14" />
                    </button>
                </div>

                <Teleport to="body">
                    <div
                        v-if="isOpen"
                        ref="dropdownRef"
                        class="object-field-dropdown"
                        :style="dropdownStyles"
                        @mousedown="handleDropdownMouseDown"
                    >
                        <div v-if="loading || suggestionsLoading" class="text-center py-4 text-muted">
                            <div class="spinner-border spinner-border-sm" role="status"></div>
                            <div class="mt-2">{{ $t('Loading...') }}</div>
                        </div>
                        <div v-else-if="error" class="alert alert-danger m-2 py-2 small">
                            {{ error }}
                        </div>
                        <template v-else>
                            <div
                                v-if="filteredObjects.length === 0"
                                class="text-center py-4 text-muted small"
                            >
                                {{ searchText.trim().length >= 2 ? 'No matching objects found' : (searchText ? 'Continue typing to search...' : 'Start typing or paste UUID') }}
                            </div>
                            <div v-else class="dropdown-items-container">
                                <template v-for="(obj, index) in filteredObjects" :key="obj.thing_id || index">
                                    <div
                                        v-if="showCategoryHeader(obj, index)"
                                        class="dropdown-header small text-uppercase text-muted"
                                    >
                                        {{ categoryLabel(obj) }}
                                    </div>
                                    <button
                                        type="button"
                                        class="dropdown-item"
                                        :data-test-name="obj.name"
                                        @click="selectObject(obj, $event)"
                                        @mousedown.prevent
                                    >
                                        <IconClass v-if="obj.type === CLASS_TYPE" width="1.1em" height="1.1em" class="flex-shrink-0" />
                                        <IconThing v-else-if="obj.type === THING_TYPE" width="1.1em" height="1.1em" class="flex-shrink-0" />
                                        <IconLink v-else width="1.1em" height="1.1em" class="flex-shrink-0" />
                                        <div class="flex-grow-1 text-truncate text-start">
                                            <div class="d-flex align-items-center gap-1">
                                                <span>{{ objectName(obj) || 'Unnamed' }}</span>
                                                <small v-if="obj._suggestionType" class="suggestion-tag">
                                                    {{ suggestionLabel(obj._suggestionType) }}
                                                </small>
                                            </div>
                                            <small v-if="objectDescription(obj)" class="text-muted d-block text-truncate">
                                                {{ objectDescription(obj) }}
                                            </small>
                                        </div>
                                        <small class="text-muted ms-auto font-monospace">
                                            {{ (obj.thing_id || '').substring(0, 6) }}…
                                        </small>
                                    </button>
                                </template>
                            </div>
                        </template>
                    </div>
                </Teleport>
            </div>

            <input
                v-if="multiple"
                type="hidden"
                :name="fieldName"
                :value="JSON.stringify(modelValue || [])"
            />
            <input
                v-else
                type="hidden"
                :name="fieldName"
                :value="modelValue || ''"
            />
        </template>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useObjectCacheStore } from '@/stores/objectCache.js'
import { useObjectHistoryStore } from '@/stores/objectHistory.js'
import { CLASS_TYPE, THING_TYPE, LINK_TYPE } from "../../constants.js";
import { objectName, objectDescription, fieldText } from "../../utils/localized.js";
import axios from 'axios';

// Icon components are globally registered, no need to import
// They are available as: IconClass, IconThing, IconLink, IconUser, IconChevronUp, IconChevronDown

const props = defineProps({
    fieldName: String,
    // When `multiple` is true this is an array of UUIDs (chips), otherwise a
    // single UUID.
    modelValue: [String, Array, null],
    // Multi-select mode: pick several objects, shown as removable chips.
    // Selection toggles instead of closing the dropdown. `modelValue` is an array.
    multiple: {
        type: Boolean,
        default: false,
    },
    isEditable: {
        type: Boolean,
        default: true
    },
    label: String,
    name: String,
    // Overrides the displayed value (e.g. a read-only "current object" slot
    // that shows the live name of the object being created). When set, the
    // cache/suggestion lookups are skipped for display purposes.
    displayName: {
        type: String,
        default: null
    },
    placeholder: {
        type: String,
        default: 'Search or paste UUID...'
    },
    maxResults: {
        type: Number,
        default: 15
    },
    type: {
        type: Number,
        default: THING_TYPE
    },
    dropdownMinWidth: {
        type: String,
        default: '360px'
    },
    excludeUuid: {
        type: String,
        default: null
    },
    // When set ('owner' | 'server'), search is scoped to only things that are
    // actually referenced as owner / server by other things (filter panel).
    filterType: {
        type: String,
        default: null,
    },
    // Include abstract grouping containers (e.g. taxonomy bases like Kinship)
    // in search results — used by parent pickers, where abstract bases are
    // valid parents for link types.
    includeAbstract: {
        type: Boolean,
        default: false,
    },
    // Show a clear (×) button when a value is selected. Optional filters
    // (e.g. owner/server in the search panel) enable this; required fields
    // that must always have an object selected leave it off.
    allowClear: {
        type: Boolean,
        default: false,
    },
    // ── Context props for history/recommendations ──
    contextObjectType: {
        type: Number,
        default: null,
    },
    contextLinkTypeId: {
        type: String,
        default: null,
    },
    contextOneThingId: {
        type: String,
        default: null,
    },
})

const emit = defineEmits(['update:modelValue'])

const cacheStore = useObjectCacheStore()
const historyStore = useObjectHistoryStore()

const searchText = ref('')
const isOpen = ref(false)
const selectedObject = ref(null)
const loading = ref(false)
const suggestionsLoading = ref(false)
const error = ref(null)
const inputRef = ref(null)
const dropdownRef = ref(null)
const wrapperRef = ref(null)
const previousDisplay = ref('')
const searchResults = ref([])
const dropdownStyles = ref({})
const isClickingDropdown = ref(false)
const pendingSuggestions = ref([])
const suggestionsLoaded = ref(false)

// Debounce timer
let debounceTimer = null

// ── Computed ───────────────────────────────────────────────────
const displayValue = computed(() => {
    if (props.multiple) return ''
    if (props.displayName) return props.displayName
    if (selectedObject.value) return objectName(selectedObject.value)
    if (!props.modelValue) return ''

    const cached = cacheStore.getCachedObject(props.modelValue)
    if (cached) return objectName(cached)
    return props.name || props.modelValue
})

const hasSelection = computed(() => props.multiple ? ((props.modelValue || []).length > 0) : !!props.modelValue)

// Chips for multi-select: resolve each selected id to its cached object so
// names render. Un-cached ids fall back to the raw id until they're hydrated.
const selectedObjects = computed(() => {
    if (!props.multiple) return []
    return (Array.isArray(props.modelValue) ? props.modelValue : [])
        .map(id => cacheStore.getCachedObject(id) || { thing_id: id })
        .filter(obj => obj && obj.thing_id)
})

const selectedIds = computed(() => {
    if (!props.multiple) return null
    return new Set(Array.isArray(props.modelValue) ? props.modelValue : [])
})

const filteredObjects = computed(() => {
    let results = [];
    if (searchResults.value.length > 0) {
        const term = searchText.value.trim().toLowerCase();
        if (term.length >= 2) {
            const usage = typeof historyStore.getUsageRank === 'function'
                ? historyStore.getUsageRank(props.contextObjectType, props.contextLinkTypeId)
                : new Map();
            results = rankTypedSearch(searchResults.value, term, usage);
        } else {
            results = searchResults.value;
        }
    } else if (!searchText.value.trim()) {
        // The initial list comes from loadSuggestions (persisted recent items
        // first, filled from other sources). It is a stable snapshot — do not
        // fall back to the volatile in-memory cache here, otherwise the list
        // would change whenever unrelated objects get cached elsewhere.
        results = pendingSuggestions.value;
    } else {
        const term = searchText.value.toLowerCase().trim()
        results = cacheStore.searchCached(props.type, term, props.maxResults) || [];
    }
    if (props.excludeUuid && results.length) {
        results = results.filter(obj => obj.thing_id !== props.excludeUuid);
    }
    // In multi-select mode, hide objects that are already picked.
    if (props.multiple && selectedIds.value && selectedIds.value.size && results.length) {
        results = results.filter(obj => !selectedIds.value.has(obj.thing_id));
    }
    return results;
})

// ── Taxonomy grouping for link-type pickers ──────────────────────
// The search endpoint attaches `category_*` fields to link-type results (the
// abstract base the link type hangs under). When present, show a group header
// at the start of each category run.
const categoryKey = (obj) => obj.category_id || obj.category_name || '';
const showCategoryHeader = (obj, index) => {
    if (props.type !== LINK_TYPE || !obj.category_name) return false;
    if (index === 0) return true;
    return categoryKey(obj) !== categoryKey(filteredObjects.value[index - 1]);
};
const categoryLabel = (obj) => fieldText(obj.category_name, obj.category_translations);

// ── Typed-search ranking ───────────────────────────────────────
// The server returns name/description substring matches ordered by date, which
// buries the exact object under look-alike names ("Yellow Pillow" under
// "Yellow Pillow 001.jpg"). For a picker we want the exact name first, then
// prefix matches, and — among them — the user's frequently-used objects above
// rare ones (usage comes from objectHistory, a personal browser signal the
// server does not have). Original server order breaks ties, preserving its
// relevance.
const nameVariants = (obj) => {
    const out = [];
    if (obj?.name) out.push(String(obj.name).toLowerCase());
    const tr = obj?.name_translations;
    if (tr && typeof tr === 'object') {
        for (const [key, value] of Object.entries(tr)) {
            if (key !== 'lang' && typeof value === 'string' && value.trim()) {
                out.push(value.toLowerCase());
            }
        }
    }
    return out;
};

const matchTier = (obj, term) => {
    let tier = 2;
    for (const n of nameVariants(obj)) {
        if (n === term) return 0;
        if (tier > 1 && n.startsWith(term)) tier = 1;
    }
    return tier;
};

const rankTypedSearch = (items, term, usage) => {
    const scored = items.map((obj, index) => ({
        obj,
        index,
        // Tier dominates (1000 apart); usage (≤ ~1.6) only rises within a tier.
        value: matchTier(obj, term) * 1000 - (usage.get(obj.thing_id) || 0),
    }));
    scored.sort((a, b) => a.value - b.value || a.index - b.index);
    return scored.map((s) => s.obj);
};

// ── Dropdown positioning ──────────────────────────────────────
const calculateDropdownPosition = () => {
    if (!wrapperRef.value) return
    const rect = wrapperRef.value.getBoundingClientRect()
    const scrollY = window.scrollY || window.pageYOffset
    const scrollX = window.scrollX || window.pageXOffset
    dropdownStyles.value = {
        position: 'absolute',
        top: `${rect.bottom + scrollY + 4}px`,
        left: `${rect.left + scrollX}px`,
        width: `${rect.width}px`,
        minWidth: props.dropdownMinWidth,
        maxWidth: `${rect.width}px`,
        maxHeight: '320px',
        overflowY: 'auto',
        zIndex: 99999,
        backgroundColor: 'white',
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: '0.375rem',
        boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.175)',
        padding: '0.5rem 0',
        fontSize: '0.875rem'
    }
}

const updateDropdownPosition = () => {
    if (isOpen.value) calculateDropdownPosition()
}

const openDropdown = async () => {
    if (!props.isEditable) return
    previousDisplay.value = displayValue.value || ''
    isOpen.value = true
    searchText.value = ''
    error.value = null
    // Load suggestions asynchronously
    suggestionsLoaded.value = false
    loadSuggestions()
    await nextTick()
    calculateDropdownPosition()
    inputRef.value?.focus()
    inputRef.value?.select()
}

const closeDropdown = () => {
    isOpen.value = false
    if (!props.modelValue && previousDisplay.value) {
        searchText.value = previousDisplay.value
    } else {
        searchText.value = ''
    }
    error.value = null
    searchResults.value = []
    if (debounceTimer) clearTimeout(debounceTimer)
}

// ── Global click / escape handlers ────────────────────────────
const handleClickOutside = (event) => {
    if (!isOpen.value) return
    const isClickOnWrapper = wrapperRef.value?.contains(event.target)
    const isClickOnDropdown = dropdownRef.value?.contains(event.target)
    if (!isClickOnWrapper && !isClickOnDropdown) {
        closeDropdown()
    }
}

const handleGlobalKeyDown = (e) => {
    if (e.key === 'Escape' && isOpen.value) {
        e.preventDefault()
        closeDropdown()
    }
}

// ── Lifecycle ─────────────────────────────────────────────────
onMounted(() => {
    window.addEventListener('scroll', updateDropdownPosition, true)
    window.addEventListener('resize', updateDropdownPosition)
    window.addEventListener('keydown', handleGlobalKeyDown, true)
    document.addEventListener('mousedown', handleClickOutside)
})

onUnmounted(() => {
    window.removeEventListener('scroll', updateDropdownPosition, true)
    window.removeEventListener('resize', updateDropdownPosition)
    window.removeEventListener('keydown', handleGlobalKeyDown, true)
    document.removeEventListener('mousedown', handleClickOutside)
    if (debounceTimer) clearTimeout(debounceTimer)
})

// ── Watch modelValue ──────────────────────────────────────────
watch(() => props.modelValue, async (newUuid) => {
    // Multi-select has no single selected object — chips resolve from the cache.
    if (props.multiple) {
        selectedObject.value = null
        return
    }
    if (!newUuid) {
        selectedObject.value = null
        return
    }
    // Filter-scoped fields (owner/server) resolve the object from the cache
    // (populated on selection). Do not fetch the object: the referenced owner
    // or server may be private / not visible to this user, and a failed fetch
    // would surface a spurious "Object not found" error in the dropdown.
    if (props.filterType) {
        error.value = null
        selectedObject.value = cacheStore.getCachedObject(newUuid) || selectedObject.value || null
        return
    }
    if (cacheStore.hasCachedObject(newUuid)) {
        selectedObject.value = cacheStore.getCachedObject(newUuid)
    } else if (cacheStore.missing?.has?.(newUuid)) {
        error.value = 'Object not found'
    } else {
        await loadObjectByUuid(newUuid)
    }
}, { immediate: true })

watch(isOpen, (newVal) => {
    if (newVal) nextTick(() => calculateDropdownPosition())
})

// Multi-select chips need the object to render its name. When the selection
// is pre-filled (e.g. a class passed in when creating an object from a class
// page), those ids may not be in the client cache yet — hydrate them so chips
// show names instead of raw UUIDs. fetchOrGetObject treats a 404 as
// "not visible/missing" and returns null without surfacing an error.
watch(() => props.modelValue, async (ids) => {
    if (!props.multiple || !Array.isArray(ids) || ids.length === 0) return
    const missing = ids.filter(id => id && !cacheStore.hasCachedObject(id) && !cacheStore.missing?.has?.(id))
    if (missing.length === 0) return
    await Promise.allSettled(missing.map(id => cacheStore.fetchOrGetObject(id)))
}, { immediate: true })

// ── Core functions ────────────────────────────────────────────
async function loadObjectByUuid(uuid) {
    if (!uuid || uuid.length < 20) return
    loading.value = true
    error.value = null
    try {
        const obj = await cacheStore.fetchOrGetObject(uuid)
        if (obj) selectedObject.value = obj
        else error.value = 'Object not found'
    } catch (err) {
        console.warn('Failed to load object', uuid, err)
        error.value = 'Cannot load object'
    } finally {
        loading.value = false
    }
}

async function loadSuggestions() {
    // For filter-scoped searches (owner/server), pre-fill with the real
    // owners/servers that actually have objects assigned.
    if (props.filterType) {
        loading.value = true
        try {
            const res = await axios.get('/search/options')
            const key = props.filterType === 'owner' ? 'owners' : 'servers'
            pendingSuggestions.value = (res.data[key] || []).slice(0, props.maxResults)
        } catch (e) {
            console.warn('Failed to load filter options:', e)
            pendingSuggestions.value = []
        } finally {
            loading.value = false
            suggestionsLoaded.value = true
        }
        return
    }
    // Phase 1 — instant paint from local data. The dropdown must never block on
    // the network: persisted recent items (+ any lists preloaded at app load)
    // render synchronously, and the richer server-backed list streams in below.
    if (!searchText.value.trim()) {
        pendingSuggestions.value = historyStore.getRecentSync(props.type, props.maxResults);
    }
    // Only show the spinner when there is genuinely nothing local to display.
    suggestionsLoading.value = pendingSuggestions.value.length === 0

    try {
        await historyStore.hydrate();
        const recent = await historyStore.getRecent(props.type, props.maxResults);
        if (!searchText.value.trim()) {
            pendingSuggestions.value = recent;
            suggestionsLoading.value = recent.length === 0;
        }

        const results = await historyStore.getSuggestions(
            props.type,
            props.contextObjectType,
            props.contextLinkTypeId,
            props.contextOneThingId,
            props.maxResults
        );
        // Swap in the complete list only if the user has not started typing —
        // a late-arriving suggestion list must not clobber the search view.
        if (!searchText.value.trim()) {
            pendingSuggestions.value = results;
            suggestionsLoading.value = false;
        }
    } catch (e) {
        console.warn('Failed to load suggestions:', e);
        if (!searchText.value.trim()) {
            pendingSuggestions.value = historyStore.getRecentSync(props.type, props.maxResults);
        }
    } finally {
        suggestionsLoading.value = false
        suggestionsLoaded.value = true
    }
}

function selectObject(obj, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (!obj?.thing_id) return
    // Self-link guard: never allow selecting the object this field is told to
    // exclude (e.g. the current object in a link's second-object selector).
    if (props.excludeUuid && obj.thing_id === props.excludeUuid) return
    isClickingDropdown.value = true
    // Cache the object so chips/displayValue can resolve its name (suggestions
    // from /search/options are not otherwise in the object cache).
    cacheStore.cacheObject(obj.thing_id, obj, obj.type || props.type)
    // Record in history
    historyStore.recordSelection(
        obj.thing_id,
        obj.type || props.type,
        props.contextObjectType,
        props.contextLinkTypeId
    );
    if (props.multiple) {
        // Toggle the object in/out of the selection and keep the dropdown open
        // so the user can keep picking. Clearing the query makes the remaining
        // suggestion list re-render (filteredObjects excludes picked ids).
        const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
        if (current.includes(obj.thing_id)) {
            emit('update:modelValue', current.filter(id => id !== obj.thing_id))
        } else {
            emit('update:modelValue', [...current, obj.thing_id])
        }
        searchText.value = ''
        searchResults.value = []
        if (debounceTimer) clearTimeout(debounceTimer)
        nextTick(() => calculateDropdownPosition())
        setTimeout(() => { isClickingDropdown.value = false }, 100)
        return
    }
    selectedObject.value = obj
    emit('update:modelValue', obj.thing_id)
    closeDropdown()
    setTimeout(() => { isClickingDropdown.value = false }, 100)
}

function removeObject(id) {
    if (!props.multiple) return
    emit('update:modelValue', (Array.isArray(props.modelValue) ? props.modelValue : []).filter(x => x !== id))
}

function clearSelection() {
    selectedObject.value = null
    if (props.multiple) {
        emit('update:modelValue', [])
    } else {
        emit('update:modelValue', null)
    }
    searchText.value = ''
    isOpen.value = false
}

function suggestionLabel(type) {
    const labels = {
        favorite: '★',
        current_user: 'you',
        context: 'suggested',
        frequent: 'frequent',
        global: 'popular',
        recent: 'recent',
    };
    return labels[type] || '';
}

function debouncedSearch(val) {
    if (val.length >= 2) {
        loading.value = true
        const searchTerm = val
        let type = []
        // Restrict results to the field's object type. Types 2–5 (class, thing,
        // link, external) are accepted by the backend validation; server fields
        // (type 6) rely on filter_type instead of a numeric type filter.
        if (props.type >= 2 && props.type <= 5) type.push(props.type)
        const body = { search: searchTerm, type, classes: [] }
        if (props.filterType) body.filter_type = props.filterType
        if (props.includeAbstract) body.include_abstract = true
        axios.post('/object', body)
            .then(response => {
                if (searchText.value !== searchTerm) return
                let results = []
                if (typeof response.data === 'string') {
                    const parsed = JSON.parse(response.data)
                    if (parsed.things && typeof parsed.things === 'object') results = Object.values(parsed.things)
                    else results = parsed.things || []
                } else {
                    if (response.data.things && typeof response.data.things === 'object') results = Object.values(response.data.things)
                    else if (Array.isArray(response.data.things)) results = response.data.things
                    else if (Array.isArray(response.data)) results = response.data
                }
                searchResults.value = results
                nextTick(() => calculateDropdownPosition())
                error.value = null
            })
            .catch(err => {
                if (searchText.value !== searchTerm) return
                console.error('Search failed:', err)
                error.value = 'Search failed'
                searchResults.value = []
            })
            .finally(() => {
                // Only a response for the current term may clear the spinner —
                // a stale response must not interrupt a newer search.
                if (searchText.value === searchTerm) loading.value = false
            })
    } else {
        searchResults.value = []
    }
}

function onInput(e) {
    const raw = e.target.value
    searchText.value = raw
    if (debounceTimer) clearTimeout(debounceTimer)
    if (raw.trim().length >= 2) {
        // Searching — show the spinner immediately (the debounced request is
        // still pending), so the dropdown never flashes "No matching objects
        // found" while results are on their way.
        loading.value = true
        debounceTimer = setTimeout(() => debouncedSearch(raw), 300)
    } else {
        loading.value = false
        searchResults.value = []
    }
}

function handleDropdownMouseDown(e) {
    e.preventDefault()
}

// Allow parent components (e.g. LinkedObject) to programmatically focus the
// visible input — focusing it also opens the dropdown via @focus="openDropdown".
defineExpose({
    focus: () => inputRef.value?.focus(),
    inputRef,
})
</script>

<style scoped>
.object-field {
    position: relative;
    width: 100%;
}
.object-field .position-relative {
    position: relative;
    overflow: visible !important;
    width: 100%;
}
.input-group { width: 100%; }
.input-group-sm .form-control,
.input-group-sm .btn { font-size: 0.875rem; }
.chips-container {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    cursor: text;
    min-height: calc(1.8125rem + 2px);
}
.chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #e9ecef;
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 0.8rem;
    white-space: nowrap;
    max-width: 100%;
}
.chip-remove {
    border: none;
    background: transparent;
    padding: 0;
    line-height: 1;
    cursor: pointer;
    opacity: 0.6;
    display: inline-flex;
}
.chip-remove:hover { opacity: 1; }
.chip-input {
    border: none;
    outline: none;
    flex: 1;
    min-width: 120px;
    padding: 1px 4px;
    font-size: 0.875rem;
    background: transparent;
}
.form-control-plaintext {
    min-height: calc(1.8125rem + 2px);
    padding-top: 0.25rem;
    padding-bottom: 0.25rem;
}
.w-100 { width: 100% !important; }
</style>

<style>
.object-field-dropdown {
    position: absolute;
    background: white;
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 0.375rem;
    box-shadow: 0 0.5rem 1rem rgba(0,0,0,0.175);
    max-height: 320px;
    overflow-y: auto;
    padding: 0.5rem 0;
    margin: 0;
    font-size: 0.875rem;
    text-align: left;
    list-style: none;
    background-clip: padding-box;
    box-sizing: border-box;
    z-index: 99999 !important;
}
.object-field-dropdown .dropdown-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.5rem 1rem;
    clear: both;
    text-align: inherit;
    text-decoration: none;
    white-space: nowrap;
    background-color: transparent;
    border: 0;
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
    gap: 0.75rem;
    box-sizing: border-box;
}
.object-field-dropdown .dropdown-item:last-child { border-bottom: none; }
.object-field-dropdown .dropdown-item:hover { background-color: #f8f9fa; }
.object-field-dropdown .dropdown-item svg { opacity: 0.75; flex-shrink: 0; }
.object-field-dropdown .text-muted { color: #6c757d !important; }
.object-field-dropdown .font-monospace {
    font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.75rem;
}
.object-field-dropdown .alert { margin-bottom: 0; }
.object-field-dropdown,
.object-field-dropdown * { box-sizing: border-box; }
.suggestion-tag {
    font-size: 0.6rem;
    opacity: 0.6;
    background: #e9ecef;
    padding: 0 4px;
    border-radius: 3px;
    line-height: 1.4;
}
</style>
