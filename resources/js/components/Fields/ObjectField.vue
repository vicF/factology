<!-- resources/js/components/Fields/ObjectField.vue -->
<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useObjectCacheStore } from '@/stores/objectCache.js'

// Optional: if you have the composable already
import { useClickOutside } from '@/composables/useClickOutside.js'

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
    }
    // objectType prop intentionally removed for now
})

const emit = defineEmits(['update:modelValue'])

const cacheStore = useObjectCacheStore()

// ── Local state ────────────────────────────────────────────────
const searchText = ref('')
const isOpen = ref(false)
const selectedObject = ref(null)
const loading = ref(false)
const error = ref(null)
const inputRef = ref(null)
const dropdownRef = ref(null)

// ── Computed ───────────────────────────────────────────────────
const displayValue = computed(() => {
    if (!props.modelValue) return ''
    if (selectedObject.value && selectedObject.value.uuid === props.modelValue) {
        return selectedObject.value.name || selectedObject.value.title || props.modelValue
    }
    return props.modelValue // fallback
})

const hasSelection = computed(() => !!props.modelValue)

// ── Dropdown visibility ────────────────────────────────────────
const openDropdown = async () => {
    if (!props.isEditable) return
    isOpen.value = true
    searchText.value = ''
    await nextTick()
    inputRef.value?.focus()
}

const closeDropdown = () => {
    isOpen.value = false
    searchText.value = ''
    error.value = null
}

useClickOutside([inputRef, dropdownRef], () => {
    if (isOpen.value) closeDropdown()
})

// ── Search & filtering ─────────────────────────────────────────
// For now we use global recent / global search (no type filtering)
const filteredObjects = computed(() => {
    if (!searchText.value.trim()) {
        // If you later want recent per type → pass dummy or remove .getRecent()
        return cacheStore.getRecent('global', props.maxResults) || []   // fallback to empty if method doesn't exist
    }

    const term = searchText.value.toLowerCase().trim()
    return cacheStore.searchCached('global', term, props.maxResults) || []
})

// ── Load selected object on mount ──────────────────────────────
onMounted(async () => {
    if (props.modelValue && !cacheStore.hasCachedObject(props.modelValue)) {
        await loadObjectByUuid(props.modelValue)
    } else if (props.modelValue) {
        selectedObject.value = cacheStore.getCachedObject(props.modelValue)
    }
})

// ── Watch modelValue ───────────────────────────────────────────
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
        // No type passed — your current fetchOrGetObject doesn't require it
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
    if (!obj?.uuid) return

    selectedObject.value = obj
    emit('update:modelValue', obj.uuid)
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

        <div
            v-if="!isEditable"
            class="form-control-plaintext d-flex align-items-center gap-2 py-1"
        >
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

        <template v-else>
            <div
                v-if="hasSelection"
                class="input-group input-group-sm"
                :class="{ 'is-invalid': error }"
            >
                <span class="input-group-text bg-light">
                    <component
                        v-if="selectedObject?.icon"
                        :is="selectedObject.icon"
                        style="width: 1.3em; height: 1.3em;"
                    />
                    <i v-else class="bi bi-link-45deg"></i>
                </span>
                <input
                    type="text"
                    class="form-control"
                    :value="displayValue"
                    readonly
                    @click="openDropdown"
                />
                <button
                    class="btn btn-outline-secondary"
                    type="button"
                    @click="clearSelection"
                    title="Clear selection"
                >
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>

            <div v-else class="position-relative">
                <input
                    ref="inputRef"
                    v-model="searchText"
                    type="text"
                    class="form-control"
                    :placeholder="placeholder"
                    :class="{ 'is-invalid': error }"
                    @focus="openDropdown"
                    @input="onInput"
                />

                <div
                    v-if="isOpen"
                    ref="dropdownRef"
                    class="dropdown-menu show shadow-sm w-100 mt-1"
                    style="max-height: 320px; overflow-y: auto;"
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
                                <div>{{ obj.name || obj.title || 'Unnamed' }}</div>
                                <small v-if="obj.subtitle" class="text-muted">
                                    {{ obj.subtitle }}
                                </small>
                            </div>

                            <small class="text-muted ms-auto font-monospace small">
                                {{ obj.uuid.substring(0, 8) }}…
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
</style>
