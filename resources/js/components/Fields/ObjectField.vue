<!-- resources/js/components/Fields/ObjectField.vue -->
<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useObjectCacheStore } from '@/stores/objectCache.js'
import { useClickOutside } from '@/composables/useClickOutside.js'
import {THING_TYPE} from "../../constants.js";

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
const wrapperRef = ref(null) // NEW: ref to parent for positioning
const previousDisplay = ref('')  // NEW: remember name before clearing on open

// ── Computed ───────────────────────────────────────────────────
const displayValue = computed(() => {
    if (!props.modelValue) return ''

    // Use synchronous getter – returns cached object instantly if present
    const cached = cacheStore.getCachedObject(props.modelValue)

    if (cached ) {
        return cached.name
    }

    // Fallback: use passed :name prop if exists, then UUID
    return props.name || props.modelValue
})

const hasSelection = computed(() => !!props.modelValue)

// ── Dropdown visibility control ────────────────────────────────
const openDropdown = async () => {
    if (!props.isEditable) return

    // Remember current display value before clearing
    previousDisplay.value = displayValue.value || ''

    isOpen.value = true
    // Clear input for clean search (user can start typing immediately)
    searchText.value = ''

    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()  // highlight empty field
}

const closeDropdown = () => {
    isOpen.value = false

    // If nothing selected after close → restore previous name in input
    if (!props.modelValue && previousDisplay.value) {
        searchText.value = previousDisplay.value
    } else {
        searchText.value = ''
    }

    error.value = null
}

useClickOutside([wrapperRef, dropdownRef], () => {
    if (isOpen.value) closeDropdown()
})

// ── Search & filtering ─────────────────────────────────────────
// Already shows recent when searchText is empty (on open without typing)
const filteredObjects = computed(() => {
    console.debug('called filteredObjects');
    if (!searchText.value.trim()) {
        // Show recent objects when dropdown opens and no search yet
        return cacheStore.getRecent(props.type, props.maxResults) || []
    }

    const term = searchText.value.toLowerCase().trim()
    return cacheStore.searchCached('object', term, props.maxResults) || []
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

function onInput(e) {
    const val = e.target.value.trim()

    if (val.length > 30 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
        loadObjectByUuid(val)
    }
}
</script>

<template>
    <div class="object-field position-relative">
        <label v-if="label" class="form-label">
            {{ label }}
            <small v-if="name">({{ name }})</small>
        </label>

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

        <!-- Editable mode – single input group always -->
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

                    <!-- Single input – conditionally readonly or editable -->
                    <input
                        ref="inputRef"
                        :type="isOpen ? 'text' : 'text'"
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

                <!-- Dropdown always below, shown only when open -->
                <div
                    v-if="isOpen"
                    ref="dropdownRef"
                    class="dropdown-menu show shadow-sm w-100 mt-1"
                    style="max-height: 320px; overflow-y: auto; z-index: 1050;"
                >
                    <div v-if="loading" class="text-center py-4 text-muted">
                        <div class="spinner-border spinner-border-sm" role="status"></div>
                        <div class="mt-2">Loading...</div>
                    </div>

                    <div v-else-if="error" class="alert alert-danger m-2 py-2 small">
                        {{ error }}
                    </div>

                    <template v-else>
                        <button
                            v-for="obj in filteredObjects"
                            :key="obj.uuid"
                            type="button"
                            class="dropdown-item d-flex align-items-center gap-3 py-2 px-3"
                            @click="selectObject(obj)"
                        >
                            <component
                                v-if="obj.icon"
                                :is="obj.icon"
                                class="flex-shrink-0"
                                style="width: 1.5em; height: 1.5em;"
                            />
                            <i v-else class="bi bi-box flex-shrink-0"></i>

                            <div class="flex-grow-1 text-truncate">
                                <!-- Show name (or title) in dropdown items -->
                                <div>{{ obj.name  || 'Unknown' }}</div>
                                <small v-if="obj.description" class="text-muted">
                                    {{ obj.description }}
                                </small>
                            </div>

                            <!-- Always show short UUID as hint -->
                            <small class="text-muted ms-auto font-monospace small">
                                {{ obj.thing_id.substring(0, 8) }}…
                            </small>
                        </button>

                        <div
                            v-if="!filteredObjects.length && searchText"
                            class="text-center py-4 text-muted small"
                        >
                            No matching objects found
                        </div>

                        <div
                            v-if="!filteredObjects.length && !searchText"
                            class="text-center py-4 text-muted small"
                        >
                            Start typing or paste UUID
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
.object-field .dropdown-menu {
    min-width: 360px;
}

.dropdown-item:hover {
    background-color: #f8f9fa;
}

.dropdown-item .bi {
    opacity: 0.75;
}

/* Ensure dropdown is positioned relative to wrapper */
.object-field .position-relative {
    position: relative;
}
</style>
