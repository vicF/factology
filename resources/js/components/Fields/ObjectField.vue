<!-- Universal component to fill UUID for any type of object or link -->
<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
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
const dropdownStyles = ref({})

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
        minWidth: '360px',
        maxWidth: `${Math.min(rect.width, 600)}px`,
        maxHeight: '320px',
        overflowY: 'auto',
        zIndex: 99999,
        backgroundColor: 'white',
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: '0.375rem',
        boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.175)',
        padding: '0.5rem 0',
        margin: 0,
        fontSize: '0.875rem',
        textAlign: 'left',
        listStyle: 'none',
        backgroundClip: 'padding-box'
    }
}

const updateDropdownPosition = () => {
    if (isOpen.value) {
        calculateDropdownPosition()
    }
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
}

// Click outside with teleported dropdown
useClickOutside([wrapperRef, dropdownRef], () => {
    if (isOpen.value) closeDropdown()
})

// ── Global Esc key handler ─────────────────────────────────────
const handleGlobalKeyDown = (e) => {
    // Only handle Escape when dropdown is open
    if (e.key === 'Escape' && isOpen.value) {
        e.stopPropagation(); // Prevent event from reaching parent
        e.preventDefault();  // Prevent default browser behavior
        closeDropdown();
    }
};

// ── Load selected object if value exists on mount ──────────────
onMounted(async () => {
    if (props.modelValue && !cacheStore.hasCachedObject(props.modelValue)) {
        await loadObjectByUuid(props.modelValue)
    } else if (props.modelValue) {
        selectedObject.value = cacheStore.getCachedObject(props.modelValue)
    }

    // Add event listeners for position updates
    window.addEventListener('scroll', updateDropdownPosition, true)
    window.addEventListener('resize', updateDropdownPosition)

    // Add global keydown listener for Esc
    window.addEventListener('keydown', handleGlobalKeyDown, true); // Use capture phase
})

onUnmounted(() => {
    // Clean up event listeners
    window.removeEventListener('scroll', updateDropdownPosition, true)
    window.removeEventListener('resize', updateDropdownPosition)
    window.removeEventListener('keydown', handleGlobalKeyDown, true);
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

// ── Watch isOpen to recalculate position ───────────────────────
watch(isOpen, (newVal) => {
    if (newVal) {
        nextTick(() => {
            calculateDropdownPosition()
        })
    }
})

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
        //await loadObjectByUuid(val)
        emit('update:modelValue', val)
        closeDropdown()
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

            // Recalculate dropdown position after results load
            nextTick(() => {
                calculateDropdownPosition()
            })
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
    <div class="object-field">
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
            <div ref="wrapperRef" class="position-relative">
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
                        @keydown.esc="closeDropdown"
                        @keydown.down.prevent="() => {}"
                        @keydown.up.prevent="() => {}"
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

                <!-- Teleported dropdown -->
                <Teleport to="body">
                    <div
                        v-if="isOpen"
                        ref="dropdownRef"
                        class="object-field-dropdown"
                        :style="dropdownStyles"
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
                            <div
                                v-if="filteredObjects.length === 0"
                                class="text-center py-4 text-muted small"
                            >
                                {{ searchText ? 'No matching objects found' : 'Start typing or paste UUID' }}
                            </div>

                            <!-- Results list -->
                            <div v-else class="dropdown-items-container">
                                <button
                                    v-for="(obj, index) in filteredObjects"
                                    :key="obj.thing_id || index"
                                    type="button"
                                    class="dropdown-item"
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

<style scoped>
.object-field {
    position: relative;
    width: 100%;
}

.object-field .position-relative {
    position: relative;
    overflow: visible !important;
}

.input-group-sm .form-control,
.input-group-sm .btn {
    font-size: 0.875rem;
}

/* Keep only component-specific styles here */
.form-control-plaintext {
    min-height: calc(1.8125rem + 2px);
    padding-top: 0.25rem;
    padding-bottom: 0.25rem;
}
</style>

<!-- Global styles - add to your main CSS file or use :global() -->
<style>
/* These styles need to be global for teleported dropdown */
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
}

.object-field-dropdown .dropdown-item:last-child {
    border-bottom: none;
}

.object-field-dropdown .dropdown-item:hover {
    background-color: #f8f9fa;
}

.object-field-dropdown .dropdown-item .bi {
    opacity: 0.75;
    flex-shrink: 0;
}

.object-field-dropdown .text-muted {
    color: #6c757d !important;
}

.object-field-dropdown .font-monospace {
    font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.75rem;
}

.object-field-dropdown .alert {
    margin-bottom: 0;
}

/* Ensure dropdown is above everything */
.object-field-dropdown {
    z-index: 99999 !important;
}
</style>
