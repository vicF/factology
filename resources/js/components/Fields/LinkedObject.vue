<!-- Edit link between two objects -->
<template>
    <template v-if="!singleField">
        <div class="linked-object">
            <div class="form-group flex-group">
                <ObjectField
                    fieldName="one_thing"
                    v-model="link.one_thing_id"
                    :isEditable="true"
                    name="First object"
                    :type="effectiveObjectType"
                    required
                />
            </div>

            <div class="form-group flex-group">
                <ObjectField
                    fieldName="link_type"
                    v-model="link.link_type_id"
                    :isEditable="true"
                    name="Link type"
                    :type="LINK_TYPE"
                    required
                    class="flex-field"
                />
                <button
                    class="btn btn-primary flex-button"
                    @click="swapObjects"
                    :disabled="!link.one_thing_id || !link.other_thing_id"
                >
                    Swap
                </button>
            </div>

            <div class="form-group flex-group">
                <ObjectField
                    fieldName="other_thing"
                    v-model="link.other_thing_id"
                    :isEditable="true"
                    name="Second object"
                    :type="effectiveObjectType"
                    required
                    class="flex-field"
                />
                <button class="btn btn-primary flex-button" @click="openCreateObjectModal">
                    Create
                </button>
            </div>

            <div class="form-group">
                <textarea
                    v-model="link.translation"
                    class="form-control"
                    placeholder="Enter description..."
                    rows="2"
                ></textarea>
            </div>

            <div class="form-group"
                 v-if="currentObject && link.one_thing_id && link.other_thing_id && link.link_type_id">
                <div class="generated-preview p-2 bg-light rounded border">
                    <small class="text-muted d-block mb-1">
                        <i class="bi bi-magic me-1"></i>
                        Auto-generated preview:
                    </small>
                    <LinkDescription
                        :link="link"
                        :object="currentObject"
                        size="medium"
                    />
                </div>
            </div>

            <div class="d-flex gap-2 mt-3">
                <button class="btn btn-danger" @click="removeSelf">Delete</button>
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
                :type="CLASS_TYPE"
                required
                class="flex-field"
            />
        </div>
    </template>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import { useObjectCacheStore } from '@/stores/objectCache.js';
import ObjectField from "./ObjectField.vue";
import LinkDescription from './../LinkDescription.vue';
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
});

const emit = defineEmits(['update', 'remove']);

const store = useObjectCacheStore();

const effectiveObjectType = computed(() => {
    if (props.objectType !== null) return props.objectType;
    if (props.currentObject?.type === CLASS_TYPE) return CLASS_TYPE;
    return THING_TYPE;
});

const link = ref({ ...props.link });
if (props.singleField && props.fixedLinkTypeUuid) {
    link.value.link_type_id = props.fixedLinkTypeUuid;
}

// Flag to prevent recursive emits
let isUpdatingFromParent = false;

// Watch for changes from parent – update internal copy without emitting back
watch(() => props.link, (newLink) => {
    const newCopy = { ...newLink };
    if (props.singleField && props.fixedLinkTypeUuid) {
        newCopy.link_type_id = props.fixedLinkTypeUuid;
    }
    isUpdatingFromParent = true;
    link.value = newCopy;
    isUpdatingFromParent = false;
}, { deep: true });

// Watch internal changes – emit only if they originated from user interaction
let previousEmitted = JSON.stringify(link.value);
watch(link, () => {
    if (isUpdatingFromParent) return; // ignore updates that came from parent
    const newSerialized = JSON.stringify(link.value);
    if (newSerialized === previousEmitted) return; // no real change
    previousEmitted = newSerialized;
    emit('update', {
        index: props.index,
        data: { ...link.value }
    });
}, { deep: true });

const oneObjectName = ref('');
const otherObjectName = ref('');
const typeName = ref('');

const loadObjectNames = async () => {
    if (link.value.one_thing_id) {
        try {
            const obj = await store.getObject(link.value.one_thing_id);
            if (obj?.name) oneObjectName.value = obj.name;
        } catch (e) {}
    }
    if (link.value.other_thing_id) {
        try {
            const obj = await store.getObject(link.value.other_thing_id);
            if (obj?.name) otherObjectName.value = obj.name;
        } catch (e) {}
    }
    if (link.value.link_type_id) {
        try {
            const obj = await store.getObject(link.value.link_type_id);
            if (obj?.name) typeName.value = obj.name;
        } catch (e) {}
    }
};

const openCreateObjectModal = () => {
    const requestId = `link-${props.index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

const handleLinkCreated = (data) => {
    if (data.requestId && data.requestId.startsWith(`link-${props.index}`)) {
        if (!link.value.other_thing_id) {
            link.value.other_thing_id = data.newObjectId;
        }
        if (data.linkTypeUuid) link.value.link_type_id = data.linkTypeUuid;
        if (data.comment !== undefined) link.value.translation = data.comment;
    }
};

onMounted(() => {
    loadObjectNames();
    eventBus.on('link-created', handleLinkCreated);
});

onUnmounted(() => {
    eventBus.off('link-created', handleLinkCreated);
});
</script>

<style scoped>
/* ... (no changes to styles) ... */
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
