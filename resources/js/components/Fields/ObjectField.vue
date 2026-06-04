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

                    <input
                        ref="inputRef"
                        type="text"
                        class="form-control"
                        :value="isOpen ? searchText : displayValue"
                        :readonly="!isOpen"
                        :placeholder="isOpen ? placeholder : (displayValue || placeholder)"
                        @focus="openDropdown"
                        @input="onInput"
                        @click="openDropdown"
                        @keydown.esc="closeDropdown"
                    />

                    <button
                        class="btn btn-outline-secondary"
                        type="button"
                        @click="isOpen ? closeDropdown() : openDropdown()"
                        :title="isOpen ? 'Close' : 'Select object'"
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
                        <div v-if="loading" class="text-center py-4 text-muted">
                            <div class="spinner-border spinner-border-sm" role="status"></div>
                            <div class="mt-2">Loading...</div>
                        </div>
                        <div v-else-if="error" class="alert alert-danger m-2 py-2 small">
                            {{ error }}
                        </div>
                        <template v-else>
                            <div
                                v-if="filteredObjects.length === 0"
                                class="text-center py-4 text-muted small"
                            >
                                {{ searchText ? 'No matching objects found' : 'Start typing or paste UUID' }}
                            </div>
                            <div v-else class="dropdown-items-container">
                                <button
                                    v-for="(obj, index) in filteredObjects"
                                    :key="obj.thing_id || index"
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
                                        <div>{{ obj.name || 'Unnamed' }}</div>
                                        <small v-if="obj.description" class="text-muted d-block text-truncate">
                                            {{ obj.description }}
                                        </small>
                                    </div>
                                    <small class="text-muted ms-auto font-monospace">
                                        {{ (obj.thing_id || '').substring(0, 6) }}…
                                    </small>
                                </button>
                            </div>
                        </template>
                    </div>
                </Teleport>
            </div>

            <input
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
import { CLASS_TYPE, THING_TYPE, LINK_TYPE } from "../../constants.js";
import axios from 'axios';

// Icon components are globally registered, no need to import
// They are available as: IconClass, IconThing, IconLink, IconUser, IconChevronUp, IconChevronDown

const props = defineProps({
    fieldName: String,
    modelValue: [String, null],
    isEditable: {
        type: Boolean,
        default: true
    },
    label: String,
    name: String,
    placeholder: {
        type: String,
        default: 'Search or paste UUID...'
    },
    maxResults: {
        type: Number,
        default: 12
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
    }
})

const emit = defineEmits(['update:modelValue'])

const cacheStore = useObjectCacheStore()

const searchText = ref('')
const isOpen = ref(false)
const selectedObject = ref(null)
const loading = ref(false)
const error = ref(null)
const inputRef = ref(null)
const dropdownRef = ref(null)
const wrapperRef = ref(null)
const previousDisplay = ref('')
const searchResults = ref([])
const dropdownStyles = ref({})
const isClickingDropdown = ref(false)

// Debounce timer
let debounceTimer = null

// ── Computed ───────────────────────────────────────────────────
const displayValue = computed(() => {
    if (!props.modelValue) return ''

    const cached = cacheStore.getCachedObject(props.modelValue)
    if (cached) return cached.name
    return props.name || props.modelValue
})

const hasSelection = computed(() => !!props.modelValue)

const filteredObjects = computed(() => {
    let results = [];
    if (searchResults.value.length > 0) {
        results = searchResults.value;
    } else if (!searchText.value.trim()) {
        results = cacheStore.getRecent(props.type, props.maxResults) || [];
    } else {
        const term = searchText.value.toLowerCase().trim()
        results = cacheStore.searchCached('object', term, props.maxResults) || [];
    }
    if (props.excludeUuid && results.length) {
        results = results.filter(obj => obj.thing_id !== props.excludeUuid);
    }
    return results;
})

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
    if (!newUuid) {
        selectedObject.value = null
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

function selectObject(obj, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (!obj?.thing_id) return
    isClickingDropdown.value = true
    selectedObject.value = obj
    emit('update:modelValue', obj.thing_id)
    closeDropdown()
    setTimeout(() => { isClickingDropdown.value = false }, 100)
}

function clearSelection() {
    selectedObject.value = null
    emit('update:modelValue', null)
    searchText.value = ''
}

function debouncedSearch(val) {
    if (val.length >= 2) {
        loading.value = true
        const searchTerm = val
        let type = []
        if (props.type === 3) type.push(3)
        if (props.type === 2) type.push(2)
        axios.post('/object', { search: searchTerm, type, classes: [] })
            .then(response => {
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
                if (searchText.value === searchTerm) {
                    searchResults.value = results
                    nextTick(() => calculateDropdownPosition())
                }
                error.value = null
            })
            .catch(err => {
                console.error('Search failed:', err)
                error.value = 'Search failed'
                searchResults.value = []
            })
            .finally(() => { loading.value = false })
    } else {
        searchResults.value = []
    }
}

function onInput(e) {
    const raw = e.target.value
    searchText.value = raw
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => debouncedSearch(raw), 300)
}

function handleDropdownMouseDown(e) {
    e.preventDefault()
}
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
</style>
