<!-- resources/js/components/Fields/ObjectField.vue -->
<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useObjectCacheStore } from '@/stores/objectCache.js'
import { useClickOutside } from '@/composables/useClickOutside.js'
import { THING_TYPE } from "../../constants.js";
import axios from 'axios';

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

// ── Computed ───────────────────────────────────────────────────
const displayValue = computed(() => {
    if (!props.modelValue) return ''

    const cached = cacheStore.getCachedObject(props.modelValue)

    if (cached) {
        return cached.name
    }

    return props.name || props.modelValue
})

const hasSelection = computed(() => !!props.modelValue)

const filteredObjects = computed(() => {
    // If we have search results from server, show them
    if (searchResults.value && searchResults.value.length > 0) {
        return searchResults.value;
    }

    // If no search text, show recent objects
    if (!searchText.value.trim()) {
        return cacheStore.getRecent(props.type, props.maxResults) || []
    }

    // Otherwise search in cache
    const term = searchText.value.toLowerCase().trim()
    return cacheStore.searchCached('object', term, props.maxResults) || []
})

// ── Dropdown visibility control ────────────────────────────────
const openDropdown = async () => {
    if (!props.isEditable) return

    previousDisplay.value = displayValue.value || ''
    isOpen.value = true
    searchText.value = ''

    await nextTick()
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
}

useClickOutside([wrapperRef, dropdownRef], () => {
    if (isOpen.value) closeDropdown()
})

// ── Load selected object if value exists on mount ──────────────
onMounted(async () => {
    if (props.modelValue && !cacheStore.hasCachedObject(props.modelValue)) {
        await loadObjectByUuid(props.modelValue)
    } else if (props.modelValue) {
        selectedObject.value = cacheStore.getCachedObject(props.modelValue)
    }
})

// ── Watch modelValue changes ───────────────────────────────────
watch(() => props.modelValue, async (newUuid) => {
    if (!newUuid) {
        selectedObject.value = null
        return
    }

    if (cacheStore.hasCachedObject(newUuid)) {
        selectedObject.value = cacheStore.getCachedObject(newUuid)
    } else {
        await loadObjectByUuid(newUuid)
    }
}, { immediate: true })

// ── Core logic ─────────────────────────────────────────────────
async function loadObjectByUuid(uuid) {
    if (!uuid || uuid.length < 20) return

    loading.value = true
    error.value = null

    try {
        const obj = await cacheStore.fetchOrGetObject(uuid)
        if (obj) {
            selectedObject.value = obj
        } else {
            error.value = 'Object not found'
        }
    } catch (err) {
        console.warn('Failed to load object', uuid, err)
        error.value = 'Cannot load object'
    } finally {
        loading.value = false
    }
}

async function selectObject(obj) {
    if (!obj?.thing_id) return

    selectedObject.value = obj
    emit('update:modelValue', obj.thing_id)
    closeDropdown()
}

function clearSelection() {
    selectedObject.value = null
    emit('update:modelValue', null)
    searchText.value = ''
}

async function onInput(e) {
    const val = e.target.value.trim()
    searchText.value = val

    // Check if it's a UUID
    if (val.length > 30 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
        searchResults.value = []
        await loadObjectByUuid(val)
    } else if (val.length >= 2) {
        try {
            loading.value = true

            let type = [];
            if (props.type === 3) type.push(3);
            if (props.type === 2) type.push(2);

            const response = await axios.post('/object', {
                search: val,
                type: type,
                classes: []
            });

            // Parse response and convert things object to array
            if (typeof response.data === 'string') {
                const parsed = JSON.parse(response.data);
                if (parsed.things && typeof parsed.things === 'object') {
                    searchResults.value = Object.values(parsed.things);
                } else {
                    searchResults.value = parsed.things || [];
                }
            } else {
                if (response.data.things && typeof response.data.things === 'object') {
                    searchResults.value = Object.values(response.data.things);
                } else if (Array.isArray(response.data.things)) {
                    searchResults.value = response.data.things;
                } else if (Array.isArray(response.data)) {
                    searchResults.value = response.data;
                } else {
                    searchResults.value = [];
                }
            }

            error.value = null;
        } catch (err) {
            console.error('Search failed:', err);
            error.value = 'Search failed';
            searchResults.value = [];
        } finally {
            loading.value = false;
        }
    } else {
        searchResults.value = [];
    }
}
</script>

<template>
    <div class="object-field position-relative">
        <label v-if="label" class="form-label">
            {{ label }}
            <small v-if="name">({{ name }})</small>
        </label>

        <!-- Readonly mode -->
        <div v-if="!isEditable" class="form-control-plaintext d-flex align-items-center gap-2 py-1">
            <component
                v-if="selectedObject?.icon"
                :is="selectedObject.icon"
                class="flex-shrink-0"
                style="width: 1.4em; height: 1.4em;"
            />
            <span v-if="displayValue">{{ displayValue }}</span>
            <span v-else class="text-muted fst-italic">—</span>
            <small v-if="selectedObject?.subtitle" class="text-muted ms-2">
                {{ selectedObject.subtitle }}
            </small>
        </div>

        <!-- Editable mode -->
        <template v-else>
            <div ref="wrapperRef" class="position-relative" style="overflow: visible !important;">
                <div class="input-group input-group-sm" :class="{ 'is-invalid': error }">
                    <span class="input-group-text bg-light">
                        <component
                            v-if="selectedObject?.icon"
                            :is="selectedObject.icon"
                            style="width: 1.3em; height: 1.3em;"
                        />
                        <i v-else class="bi bi-link-45deg"></i>
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
                    />

                    <button
                        class="btn btn-outline-secondary"
                        type="button"
                        @click="isOpen ? closeDropdown() : openDropdown()"
                        :title="isOpen ? 'Close' : 'Select object'"
                    >
                        <i :class="isOpen ? 'bi bi-chevron-up' : 'bi bi-chevron-down'"></i>
                    </button>
                </div>

                <!-- Dropdown -->
                <div
                    v-if="isOpen"
                    ref="dropdownRef"
                    class="dropdown-menu show"
                    style="
                        display: block;
                        position: absolute;
                        top: 100%;
                        left: 0;
                        width: 100%;
                        max-height: 320px;
                        overflow-y: auto;
                        z-index: 9999;
                        margin-top: 4px;
                        padding: 0.5rem 0;
                    "
                >
                    <!-- Loading state -->
                    <div v-if="loading" class="text-center py-4 text-muted">
                        <div class="spinner-border spinner-border-sm" role="status"></div>
                        <div class="mt-2">Loading...</div>
                    </div>

                    <!-- Error state -->
                    <div v-else-if="error" class="alert alert-danger m-2 py-2 small">
                        {{ error }}
                    </div>

                    <!-- Results -->
                    <template v-else>
                        <!-- No results -->
                        <div v-if="filteredObjects.length === 0" class="text-center py-4 text-muted small">
                            {{ searchText ? 'No matching objects found' : 'Start typing or paste UUID' }}
                        </div>

                        <!-- Results list -->
                        <div v-else>
                            <button
                                v-for="(obj, index) in filteredObjects"
                                :key="obj.thing_id || index"
                                type="button"
                                class="dropdown-item d-flex align-items-center gap-3 py-2 px-3"
                                @click="selectObject(obj)"
                            >
                                <i class="bi bi-box flex-shrink-0"></i>

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
            </div>

            <input
                type="hidden"
                :name="fieldName"
                :value="modelValue || ''"
            />
        </template>
    </div>
</template>

<style scoped>
.object-field {
    position: relative;
}

.object-field .position-relative {
    position: relative;
    overflow: visible !important;
}

.object-field .dropdown-menu {
    display: block;
    position: absolute;
    top: 100%;
    left: 0;
    width: 100%;
    min-width: 360px;
    background: white;
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 0.375rem;
    box-shadow: 0 0.5rem 1rem rgba(0,0,0,0.175);
    margin-top: 0.25rem;
    padding: 0.5rem 0;
    z-index: 9999;
}

.dropdown-item {
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
}

.dropdown-item:last-child {
    border-bottom: none;
}

.dropdown-item:hover {
    background-color: #f8f9fa;
}

.dropdown-item .bi {
    opacity: 0.75;
}

.input-group-sm .form-control,
.input-group-sm .btn {
    font-size: 0.875rem;
}

.object-field {
    z-index: 1;
}

.object-field .dropdown-menu.show {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
}
</style>
