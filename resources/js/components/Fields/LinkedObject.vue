<!-- Edit link between two objects -->
<template>
    <template v-if="!singleField">
        <div class="linked-object">
            <div class="form-group flex-group">
                <ObjectField
                    fieldName="one_thing"
                    v-model="link.one_thing_id"
                    :isEditable="!lockFirst"
                    :name="lockFirst ? currentObjectDisplayName : 'First object'"
                    :displayName="lockFirst ? currentObjectDisplayName : null"
                    :type="effectiveObjectType"
                    :contextObjectType="contextObjectType"
                    :contextLinkTypeId="contextLinkTypeId"
                    :contextOneThingId="contextOneThingId"
                    :excludeUuid="lockFirst ? null : (link.other_thing_id || null)"
                    required
                />
                <span
                    v-if="lockFirst && currentObjectUnsaved"
                    class="badge badge-unsaved"
                    :title="$t('This object is not saved yet')"
                >{{ unsavedLabel }}</span>
            </div>

            <div class="form-group flex-group">
                <ObjectField
                    fieldName="link_type"
                    v-model="link.link_type_id"
                    :isEditable="true"
                    :name="$t('Link type')"
                    :type="LINK_TYPE"
                    required
                    class="flex-field"
                />
                <button
                    type="button"
                    class="btn btn-primary flex-button"
                    @click="swapObjects"
                    :disabled="!link.one_thing_id || !link.other_thing_id || link.one_thing_id === link.other_thing_id"
                    :title="lockFirst || lockSecond ? $t('Swap direction of the link') : $t('Swap the two objects')"
                >
                    {{ $t('Swap') }}
                </button>
            </div>

            <div class="form-group flex-group">
                <ObjectField
                    ref="secondObjectFieldRef"
                    fieldName="other_thing"
                    v-model="link.other_thing_id"
                    :isEditable="!lockSecond"
                    :name="lockSecond ? currentObjectDisplayName : $t('Second object')"
                    :displayName="lockSecond ? currentObjectDisplayName : null"
                    :type="effectiveObjectType"
                    :contextObjectType="contextObjectType"
                    :contextLinkTypeId="contextLinkTypeId"
                    :contextOneThingId="contextOneThingId"
                    :excludeUuid="lockSecond ? null : (link.one_thing_id || null)"
                    required
                    class="flex-field"
                />
                <span
                    v-if="lockSecond && currentObjectUnsaved"
                    class="badge badge-unsaved"
                    :title="$t('This object is not saved yet')"
                >{{ unsavedLabel }}</span>
                <button
                    v-if="!lockSecond"
                    type="button"
                    class="btn btn-primary flex-button"
                    @click="openCreateObjectModal"
                >
                    {{ $t('Create') }}
                </button>
            </div>

            <div class="form-group">
                <textarea
                    v-model="link.translation"
                    class="form-control"
                    :placeholder="$t('Enter description...')"
                    rows="2"
                ></textarea>
            </div>

            <div class="row g-2 mb-2">
                <div class="col-md-6">
                    <FlexibleDateField
                        side="start"
                        :start="link.link_start"
                        :end="link.link_end"
                        :startMeta="link.link_start_meta"
                        :endMeta="link.link_end_meta"
                        :isEditable="true"
                        :label="$t('Link start')"
                        @update:value="applyLinkStartDate"
                    />
                </div>
                <div class="col-md-6">
                    <FlexibleDateField
                        side="end"
                        :start="link.link_start"
                        :end="link.link_end"
                        :startMeta="link.link_start_meta"
                        :endMeta="link.link_end_meta"
                        :isEditable="true"
                        :label="$t('Link end')"
                        :disabled="startSpansDates"
                        @update:value="applyLinkEndDate"
                    />
                </div>
            </div>

            <!-- Auto‑generated preview with safe fallback -->
            <div class="form-group"
                 v-if="currentObject && link.one_thing_id && link.other_thing_id && link.link_type_id">
                <div class="generated-preview p-2 bg-light rounded border">
                    <small class="text-muted d-block mb-1">
                        <i class="bi bi-magic me-1"></i>
                        Auto-generated preview:
                    </small>
                    <LinkDescription
                        :key="`${link.one_thing_id}-${link.link_type_id}-${link.other_thing_id}`"
                        :link="link"
                        :object="currentObject"
                    />
                </div>
            </div>

            <div class="d-flex gap-2 mt-3">
                <button type="button" class="btn btn-danger" @click="removeSelf">{{ $t('Delete') }}</button>
            </div>
        </div>
    </template>

    <template v-else>
        <div class="form-group flex-group">
            <ObjectField
                fieldName="other_thing"
                v-model="link.other_thing_id"
                :isEditable="true"
                :label="targetLabel"
                :type="parentTargetType"
                :includeAbstract="props.objectType === LINK_TYPE"
                :contextObjectType="contextObjectType"
                :contextLinkTypeId="contextLinkTypeId"
                :contextOneThingId="contextOneThingId"
                :excludeUuid="currentObject?.thing_id || null"
                required
                class="flex-field"
            />
        </div>
    </template>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { useObjectCacheStore } from '@/stores/objectCache.js';
import ObjectField from "./ObjectField.vue";
import LinkDescription from './../LinkDescription.vue';
import FlexibleDateField from './FlexibleDateField.vue';
import { CLASS_TYPE, LINK_TYPE, THING_TYPE } from "../../constants.js";
import { eventBus } from "../../eventBus.js";

const props = defineProps({
    link: { type: Object, required: true },
    currentObject: { type: Object, default: null },
    index: { type: Number, required: true },
    singleField: { type: Boolean, default: false },
    fixedLinkTypeUuid: { type: String, default: null },
    targetLabel: { type: String, default: 'Target object' },
    objectType: { type: Number, default: null },
    // When true the current object is pinned to this link row: whichever slot
    // holds it is shown read-only (the object being edited cannot be changed
    // inside the link row). Used by the EditObject form, where one end of every
    // link is always the object being edited; swapping direction only moves the
    // read-only slot to the other end.
    lockFirstObject: { type: Boolean, default: false },
    // Marks the fixed first object as "not saved yet" (create mode).
    currentObjectUnsaved: { type: Boolean, default: false },
    currentObjectPlaceholder: { type: String, default: '<current object>' },
    unsavedLabel: { type: String, default: 'not saved yet' },
});

const emit = defineEmits(['update', 'remove']);

const store = useObjectCacheStore();

const effectiveObjectType = computed(() => {
    if (props.objectType !== null) return props.objectType;
    if (props.currentObject?.type === CLASS_TYPE) return CLASS_TYPE;
    return THING_TYPE;
});

// Kind of the target picker for the single-field (parent) mode: classes pick
// class parents, link types pick link-type parents.
const parentTargetType = computed(() => props.objectType || CLASS_TYPE);

const contextObjectType = computed(() => {
    return effectiveObjectType.value;
});

// Live name for the fixed "first object" slot — shows the current object's
// typed name, falling back to a placeholder while it is still unnamed.
const currentObjectDisplayName = computed(() => {
    const name = props.currentObject?.name;
    return (name && String(name).trim()) ? String(name).trim() : props.currentObjectPlaceholder;
});

const contextLinkTypeId = computed(() => {
    return link.value.link_type_id || props.fixedLinkTypeUuid;
});

const contextOneThingId = computed(() => {
    return link.value.one_thing_id || props.currentObject?.thing_id;
});

const link = ref({
    link_start: null,
    link_end: null,
    link_start_meta: null,
    link_end_meta: null,
    ...props.link,
});
if (props.singleField && props.fixedLinkTypeUuid) {
    link.value.link_type_id = props.fixedLinkTypeUuid;
}

// ── link dates ─────────────────────────────────────────────────
// Mirrors EditObject's thing date handling: the Start field owns both
// columns for spanning qualifiers (between/alternatives/before), so the
// End field is disabled while one is active.
const startSpansDates = computed(() => {
    const q = link.value.link_start_meta?.qualifier;
    return q === 'between' || q === 'alternatives' || q === 'before';
});

function applyLinkStartDate({ start, end, meta }) {
    link.value.link_start = start || null;
    link.value.link_start_meta = meta || null;
    if (end != null && end !== '') {
        link.value.link_end = end;
    }
}

function applyLinkEndDate({ start, end, meta }) {
    link.value.link_end = end || null;
    link.value.link_end_meta = meta || null;
}

// The current object is pinned to this row (EditObject passes
// lockFirstObject=true). The pinned object's identity is fixed by the form, so
// whichever slot holds it is read-only — swapping direction just moves the
// read-only slot to the other end instead of unlocking the object.
const pinnedCurrentObject = computed(() =>
    props.lockFirstObject && props.currentObject?.thing_id != null
);
const lockFirst = computed(() =>
    pinnedCurrentObject.value && link.value.one_thing_id === props.currentObject.thing_id
);
const lockSecond = computed(() =>
    pinnedCurrentObject.value && link.value.other_thing_id === props.currentObject.thing_id
);

// The second-object selector (the one the user actually needs to fill in when
// adding a link) — used to move focus there instead of the fixed first slot.
const secondObjectFieldRef = ref(null);
const focusSecondObject = () => {
    secondObjectFieldRef.value?.focus?.();
};
defineExpose({ focusSecondObject });

let isUpdatingFromParent = false;
let previousEmitted = JSON.stringify(link.value);

watch(() => props.link, (newLink) => {
    const newCopy = { ...newLink };
    if (props.singleField && props.fixedLinkTypeUuid) {
        newCopy.link_type_id = props.fixedLinkTypeUuid;
    }
    isUpdatingFromParent = true;
    link.value = newCopy;
    isUpdatingFromParent = false;
}, { deep: true });

watch(link, () => {
    if (isUpdatingFromParent) return;
    const newSerialized = JSON.stringify(link.value);
    if (newSerialized === previousEmitted) return;
    previousEmitted = newSerialized;
    emit('update', {
        index: props.index,
        data: { ...link.value }
    });
}, { deep: true });

// Safe preloading: only fetch valid UUIDs (length > 20)
const preloadObjectNames = async () => {
    const selfId = props.currentObject?.thing_id;
    const ids = [link.value.one_thing_id, link.value.other_thing_id, link.value.link_type_id]
        .filter(id => id && typeof id === 'string' && id.length > 20 && id !== selfId);
    for (const id of ids) {
        if (!store.hasCachedObject(id)) {
            try {
                await store.fetchOrGetObject(id);
            } catch (e) {
                // Silently ignore 404 – the object might not exist yet (e.g., new unsaved object)
                console.debug(`Preload failed for ${id}:`, e.message);
            }
        }
    }
};

watch(() => [link.value.one_thing_id, link.value.other_thing_id, link.value.link_type_id],
    () => { preloadObjectNames(); },
    { deep: true }
);

// The requestId of the create modal this row opened, so the link-created event
// is matched exactly. With stacked modals several link rows may share an index,
// so a prefix match is not enough — only the row that actually opened the modal
// may consume the result.
const pendingCreateRequestId = ref(null);

const openCreateObjectModal = () => {
    const requestId = `link-${props.index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    pendingCreateRequestId.value = requestId;
    const payload = {
        title: 'Create new object',
        params: { type: effectiveObjectType.value },
        callback: {
            type: 'link-created',
            requestId: requestId,
            targetComponent: 'linked-object',
            index: props.index,
            linkTypeUuid: link.value.link_type_id,
            comment: link.value.translation
        }
    };
    eventBus.emit('open-create-modal', payload);
};

const swapObjects = () => {
    const temp = link.value.one_thing_id;
    link.value.one_thing_id = link.value.other_thing_id;
    link.value.other_thing_id = temp;
};

const removeSelf = () => {
    emit('remove', props.index);
};

const handleLinkCreated = async (data) => {
    if (data.requestId && data.requestId === pendingCreateRequestId.value) {
        const newId = data.newObjectId;
        if (newId && !link.value.other_thing_id) {
            await nextTick();
            link.value.other_thing_id = newId;
            if (data.linkTypeUuid) link.value.link_type_id = data.linkTypeUuid;
            if (data.comment !== undefined) link.value.translation = data.comment;

            // No need to preload – the object is already created and cached by the modal
            emit('update', {
                index: props.index,
                data: { ...link.value }
            });
        }
    }
};

onMounted(() => {
    preloadObjectNames();
    eventBus.on('link-created', handleLinkCreated);
});

onUnmounted(() => {
    eventBus.off('link-created', handleLinkCreated);
});
</script>

<style scoped>
/* (same styles as before – unchanged) */
.linked-object {
    border: 1px solid #ddd;
    padding: 15px;
    margin-bottom: 15px;
    border-radius: 4px;
}
.form-group { margin-bottom: 15px; }
.form-label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
    font-size: 0.9rem;
}
.form-label small { font-weight: normal; font-size: 0.8rem; }
.flex-group {
    display: flex;
    align-items: stretch;
    gap: 8px;
    margin-bottom: 10px;
}
.flex-field { flex: 1; min-width: 0; }
.flex-button {
    flex-shrink: 0;
    height: auto;
    padding: 0 15px;
    white-space: nowrap;
    display: flex;
    align-items: center;
    margin: 0;
    border-radius: 4px;
    font-size: 14px;
    line-height: 1;
}
.badge-unsaved {
    flex-shrink: 0;
    align-self: center;
    background-color: #ffc107;
    color: #212529;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 3px 7px;
    border-radius: 3px;
    white-space: nowrap;
}
.form-control {
    width: 100%;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: inherit;
}
.form-control:focus {
    border-color: #007bff;
    outline: none;
    box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
}
.generated-preview {
    background-color: #f8f9fa;
    border: 1px solid #dee2e6;
    color: #495057;
    font-size: 0.9rem;
    line-height: 1.5;
    padding: 8px;
    border-radius: 4px;
}
.btn-danger {
    background-color: #dc3545;
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-danger:hover { background-color: #c82333; }
.btn-primary {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-primary:hover { background-color: #0069d9; }
.bi { font-size: 0.9rem; }
</style>
