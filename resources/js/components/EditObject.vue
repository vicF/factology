<!-- Dialog to create new or edit existing object -->
<template>
    <div class="modal fade" :id="modalId" tabindex="-1" :aria-labelledby="modalLabelId" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" :id="modalLabelId">
                        {{ title || (isEditMode ? $t('Edit Object') : $t('Create Object')) }}
                    </h5>
                    <button
                        type="button"
                        class="btn-close"
                        data-bs-dismiss="modal"
                        :aria-label="$t('Close')"
                    ></button>
                </div>
                <div class="modal-body">
                    <form @submit.prevent="submitForm">
                        <!-- Class field for Thing type (type 3) -->
                        <div class="mb-3" v-if="formData.type === 3">
                            <LinkedObject
                                :link="classLink"
                                :currentObject="{ thing_id: formData.thing_id, name: formData.name }"
                                :index="0"
                                :singleField="true"
                                :fixedLinkTypeUuid="LINK_TO_CLASS"
                                :targetLabel="$t('Class')"
                                @update="handleClassLinkUpdate"
                                @remove="handleClassLinkRemove"
                            />
                        </div>

                        <!-- Parent field for Class type (type 2) -->
                        <div class="mb-3" v-if="formData.type === 2">
                            <LinkedObject
                                :link="parentLink"
                                :currentObject="{ thing_id: formData.thing_id, name: formData.name }"
                                :index="0"
                                :singleField="true"
                                :fixedLinkTypeUuid="LINK_TO_PARENT"
                                :targetLabel="$t('Parent')"
                                @update="handleParentLinkUpdate"
                                @remove="handleParentLinkRemove"
                            />
                        </div>

                        <div class="mb-3">
                            <TextField
                                fieldName="name"
                                v-model="formData.name"
                                :isEditable="true"
                                :label="$t('Name')"
                                required
                            />
                        </div>
                        <div class="mb-3">
                            <TextField
                                fieldName="description"
                                v-model="formData.description"
                                :isEditable="true"
                                :label="$t('Description')"
                            />
                        </div>
                        <div class="mb-3">
                            <DateField
                                fieldName="start"
                                v-model="formData.start"
                                :isEditable="true"
                                :label="$t('Start')"
                            />
                        </div>
                        <div class="mb-3">
                            <DateField
                                fieldName="end"
                                v-model="formData.end"
                                :isEditable="true"
                                :label="$t('End')"
                            />
                        </div>

                        <!-- Object type indicator -->
                        <div v-if="formData.type == 1" class="mb-3">General</div>
                        <div v-if="formData.type == 2" class="mb-3">Class</div>
                        <div v-else-if="formData.type == 3" class="mb-3">Thing</div>
                        <div v-else-if="formData.type == 4" class="mb-3">Link</div>
                        <div v-else-if="formData.type == 5" class="mb-3">External</div>
                        <div v-else class="mb-3">!Unknown type!</div>

                        <button type="button" class="btn btn-primary mb-3" @click="addNewLinkedObject">
                            {{ $t('Add Link') }}
                        </button>

                        <!-- Display regular links (not special ones) -->
                        <div v-for="item in regularLinks" :key="item.id" class="linked-object-form">
                            <LinkedObject
                                :link="{
                                    one_thing_id: formData.thing_id,
                                    other_thing_id: item.otherThingUuid,
                                    link_type_id: item.linkTypeUuid,
                                    translation: item.comment,
                                    link_id: item.linkId
                                }"
                                :currentObject="{
                                    thing_id: formData.thing_id,
                                    name: formData.name
                                }"
                                :index="linkedObjects.indexOf(item)"
                                @update="updateItem"
                                @remove="removeItem"
                            />
                        </div>

                        <div class="modal-footer">
                            <button
                                type="button"
                                class="btn btn-secondary"
                                data-bs-dismiss="modal"
                            >
                                {{ $t('Close') }}
                            </button>
                            <button type="submit" class="btn btn-primary">
                                {{ isEditMode ? $t('Update') : $t('Save') }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <!-- Unsaved Changes Confirmation Modal -->
    <div class="modal fade" :id="confirmModalId" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-sm">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">{{ $t('Unsaved Changes') }}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <p>{{ $t('You have unsaved changes. Are you sure you want to close?') }}</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                        {{ $t('Cancel') }}
                    </button>
                    <button type="button" class="btn btn-danger" @click="confirmClose">
                        {{ $t('Close without Saving') }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { Modal } from 'bootstrap';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from 'vue-i18n';
import TextField from './Fields/TextField.vue';
import ObjectField from './Fields/ObjectField.vue';
import DateField from './Fields/DateField.vue';
import LinkedObject from './Fields/LinkedObject.vue';
import { CLASS_TYPE, LINK_TO_CLASS, LINK_TO_PARENT, THING_TYPE } from "../constants.js";
import { eventBus } from "../eventBus.js";
import { useObjectsStore } from '@/stores/objects';

const objectsStore = useObjectsStore();

// Props definition
const props = defineProps({
    object: { type: Object, default: null },
    params: { type: Object, default: () => ({}) },
    title: { type: String, default: '' },
    initialLinkedObjects: { type: Array, default: () => [] },
    callback: { type: Object, default: null }
});

// Emits definition
const emit = defineEmits(['close', 'object-created', 'object-updated', 'callback-complete']);

// Composables
const { t } = useI18n();
const router = useRouter();

// Computed
const isEditMode = computed(() => !!props.object);

// Refs
const formData = ref({
    thing_id: isEditMode.value
        ? (props.object.thing_id || props.object.id || uuidv4())
        : uuidv4(),
    name: isEditMode.value ? props.object.name || '' : '',
    description: isEditMode.value ? props.object.description || '' : '',
    start: isEditMode.value ? props.object.start || '' : '',
    end: isEditMode.value ? props.object.end || '' : '',
    public: isEditMode.value ? props.object.public || 0 : 0,
    parent_id: props.params.parentId || null,
    parent_link_id: null,                 // store link ID for parent link
    class_id: props.params.classId || null,
    class_name: props.params.className || null,
    link_id: null,                        // store link ID for class link
    type: props.params.type || 3,
});

const linkedObjects = ref([]);
let modalInstance = null;
let confirmModalInstance = null;
let isClosing = false;
let isSubmitting = false;

// Unsaved changes tracking
const originalFormData = ref({});
const originalLinkedObjects = ref([]);

const hasUnsavedChanges = computed(() => {
    if (isSubmitting) return false;

    const formChanged = Object.keys(originalFormData.value).some(key => {
        const original = originalFormData.value[key] || '';
        const current = formData.value[key] || '';
        return original !== current;
    });

    const linksChanged = JSON.stringify(originalLinkedObjects.value) !== JSON.stringify(linkedObjects.value);
    return formChanged || linksChanged;
});

// Regular links (exclude special class/parent links)
const regularLinks = computed(() => {
    return linkedObjects.value.filter(item => {
        if (formData.value.type === 3 && item.linkTypeUuid === LINK_TO_CLASS) return false;
        if (formData.value.type === 2 && item.linkTypeUuid === LINK_TO_PARENT) return false;
        return true;
    });
});

// Helper to find a link by type in linkedObjects (used for initialization)
const findLinkByType = (typeUuid) => {
    return linkedObjects.value.find(l => l.linkTypeUuid === typeUuid);
};

// ---- Class link (for Thing type) ----
const classLink = computed({
    get: () => ({
        one_thing_id: formData.value.thing_id,
        other_thing_id: formData.value.class_id || '',
        link_type_id: LINK_TO_CLASS,
        translation: '',
        link_id: formData.value.link_id || null,
    }),
    set: () => {} // read-only, updates go via handleClassLinkUpdate
});

const handleClassLinkUpdate = ({ data }) => {
    formData.value.class_id = data.other_thing_id;
    formData.value.link_id = data.link_id;
};

const handleClassLinkRemove = () => {
    formData.value.class_id = null;
    formData.value.link_id = null;
};

// ---- Parent link (for Class type) ----
const parentLink = computed({
    get: () => ({
        one_thing_id: formData.value.thing_id,
        other_thing_id: formData.value.parent_id || '',
        link_type_id: LINK_TO_PARENT,
        translation: '',
        link_id: formData.value.parent_link_id || null,
    }),
    set: () => {}
});

const handleParentLinkUpdate = ({ data }) => {
    formData.value.parent_id = data.other_thing_id;
    formData.value.parent_link_id = data.link_id;
};

const handleParentLinkRemove = () => {
    formData.value.parent_id = null;
    formData.value.parent_link_id = null;
};

// Modal IDs
const modalId = `editObjectModal-${formData.value.thing_id}`;
const modalLabelId = `editObjectModalLabel-${formData.value.thing_id}`;
const confirmModalId = `confirmModal-${formData.value.thing_id}`;

// Initialize data and store original state
const initializeData = () => {
    // Reset linked objects
    linkedObjects.value = [];

    // Reset special fields
    if (formData.value.type === 2) {
        formData.value.parent_id = null;
        formData.value.parent_link_id = null;
    } else if (formData.value.type === 3) {
        formData.value.class_id = null;
        formData.value.link_id = null;
    }

    // Process initialLinkedObjects
    props.initialLinkedObjects.forEach(item => {
        const linkItem = {
            id: uuidv4(),
            otherThingUuid: item.other_thing_id || '',
            linkTypeUuid: item.link_type_id || '',
            comment: item.description || item.comment || '',
            linkId: item.linkId || null,
        };

        // Handle LINK_TO_CLASS for Thing type
        if (formData.value.type === THING_TYPE && item.link_type_id === LINK_TO_CLASS) {
            formData.value.class_id = item.other_thing_id;
            formData.value.link_id = item.linkId || null;
            return; // do not add to linkedObjects
        }

        // Handle LINK_TO_PARENT for Class type
        if (formData.value.type === CLASS_TYPE && item.link_type_id === LINK_TO_PARENT) {
            formData.value.parent_id = item.other_thing_id;
            formData.value.parent_link_id = item.linkId || null;
            return; // do not add to linkedObjects
        }

        // Skip any other special links that might appear
        if (formData.value.type === CLASS_TYPE && item.link_type_id === LINK_TO_CLASS) return;
        if (isEditMode.value && (
            (formData.value.type === THING_TYPE && item.link_type_id === LINK_TO_CLASS) ||
            (formData.value.type === CLASS_TYPE && item.link_type_id === LINK_TO_PARENT)
        )) return;

        linkedObjects.value.push(linkItem);
    });

    // For edit mode, also process existing links from the object (if not already set)
    if (isEditMode.value && props.object) {
        if (formData.value.type === 3 && props.object.class?.thing_id && !formData.value.class_id) {
            formData.value.class_id = props.object.class.thing_id;
            formData.value.link_id = props.object.class?.link_id || null;
        }
        if (formData.value.type === 2 && props.object.parent_id && !formData.value.parent_id) {
            formData.value.parent_id = props.object.parent_id;
            formData.value.parent_link_id = props.object.parent_link_id || null;
        }
    }

    originalFormData.value = JSON.parse(JSON.stringify(formData.value));
    originalLinkedObjects.value = JSON.parse(JSON.stringify(linkedObjects.value));
};

initializeData();

const addNewLinkedObject = () => {
    linkedObjects.value.push({
        id: uuidv4(),
        otherThingUuid: '',
        linkTypeUuid: '2da45f14-69c6-4d56-9f2f-809fda14abf5',
        comment: '',
        linkId: null,
    });
};

const updateItem = ({ index, data }) => {
    linkedObjects.value[index] = {
        ...linkedObjects.value[index],
        otherThingUuid: data.other_thing_id,
        linkTypeUuid: data.link_type_id,
        comment: data.translation,
        linkId: data.link_id,
    };
};

const removeItem = (index) => {
    linkedObjects.value.splice(index, 1);
};

const confirmClose = () => {
    if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
    }
    if (confirmModalInstance) confirmModalInstance.hide();
    const modalElement = document.getElementById(modalId);
    if (modalElement && modalInstance) {
        modalElement.removeEventListener('hide.bs.modal', handleHideModal);
        modalInstance.hide();
    }
    emit('close');
};

const handleHideModal = (event) => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const modalElement = document.getElementById(modalId);
    if (!modalElement || !modalInstance) {
        event.preventDefault();
        event.stopPropagation();
        return;
    }
    if (hasUnsavedChanges.value && !isClosing && !isSubmitting) {
        event.preventDefault();
        event.stopPropagation();
        if (confirmModalInstance) confirmModalInstance.show();
    }
};

const submitForm = async () => {
    if (isSubmitting) return;
    try {
        isSubmitting = true;

        // Prepare links to add (only those without linkId)
        const linksToAdd = regularLinks.value
            .filter(item => item.otherThingUuid?.trim() && !item.linkId)
            .map(item => ({
                one_thing_id: formData.value.thing_id,
                link_type_id: item.linkTypeUuid,
                other_thing_id: item.otherThingUuid,
                description: item.comment || '',
                public: 0,
            }));

        const payload = {
            thing_id: formData.value.thing_id,
            name: formData.value.name,
            description: formData.value.description,
            start: formData.value.start || null,
            end: formData.value.end || null,
            public: formData.value.public,
            parent_id: formData.value.parent_id,
            type: formData.value.type,
        };

        // Add class link for Thing type (using the stored link_id if any)
        if (formData.value.type === 3 && formData.value.class_id) {
            payload.class = {
                one_thing_id: formData.value.thing_id,
                link_type_id: LINK_TO_CLASS,
                other_thing_id: formData.value.class_id,
                description: '',
                link_id: formData.value.link_id || undefined,
                public: 1,
            };
        }

        // Add parent link for Class type
        if (formData.value.type === 2 && formData.value.parent_id) {
            payload.parent = {
                one_thing_id: formData.value.thing_id,
                link_type_id: LINK_TO_PARENT,
                other_thing_id: formData.value.parent_id,
                description: '',
                link_id: formData.value.parent_link_id || undefined,
                public: 1,
            };
        }

        if (linksToAdd.length > 0) payload.links_to_add = linksToAdd;

        // Handle updates/deletions for regular links
        if (isEditMode.value) {
            const linksToUpdate = regularLinks.value
                .filter(item => item.linkId && item.otherThingUuid?.trim())
                .map(item => ({
                    link_id: item.linkId,
                    one_thing_id: formData.value.thing_id,
                    other_thing_id: item.otherThingUuid,
                    link_type_id: item.linkTypeUuid,
                    translation: item.comment,
                }));
            if (linksToUpdate.length > 0) payload.links_to_update = linksToUpdate;

            const linksToDelete = originalLinkedObjects.value
                .filter(orig => orig.linkId && !regularLinks.value.find(curr => curr.linkId === orig.linkId))
                .map(orig => orig.linkId);
            if (linksToDelete.length > 0) payload.links_to_delete = linksToDelete;
        }

        let response;
        if (isEditMode.value) {
            response = await axios.put(`/object/${formData.value.thing_id}`, payload);
            emit('object-updated', response.data);
            if (formData.value.type === 2) {
                const oldParentId = props.object?.parent_id;
                const newParentId = formData.value.parent_id;
                if (oldParentId !== newParentId) {
                    objectsStore.moveClassInTree(formData.value.thing_id, newParentId);
                }
                objectsStore.updateClassInTree(formData.value.thing_id, formData.value.name);
            }
        } else {
            response = await axios.post(`/object/${formData.value.thing_id}`, payload);
            emit('object-created', response.data);
            if (formData.value.type === 2) {
                objectsStore.addClassToTree(formData.value.thing_id, formData.value.name, formData.value.parent_id);
            }
            if (props.callback && props.callback.type === 'link-created') {
                eventBus.emit('link-created', {
                    requestId: props.callback.requestId,
                    newObjectId: formData.value.thing_id,
                    newObjectName: formData.value.name,
                    index: props.callback.index,
                    linkTypeUuid: props.callback.linkTypeUuid,
                    comment: props.callback.comment
                });
            }
        }

        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        const modalElement = document.getElementById(modalId);
        if (modalElement) modalElement.removeEventListener('hide.bs.modal', handleHideModal);
        if (modalInstance) modalInstance.hide();
        setTimeout(() => {
            emit('close');
            isSubmitting = false;
        }, 300);
    } catch (error) {
        console.error('Submit error:', error.response || error);
        alert(t('Failed') + ': ' + (error.response?.data?.message || error.message));
        isSubmitting = false;
    }
};

onMounted(async () => {
    await nextTick();
    const modalElement = document.getElementById(modalId);
    const confirmModalElement = document.getElementById(confirmModalId);
    if (modalElement) {
        modalInstance = new Modal(modalElement);
        modalElement.addEventListener('hide.bs.modal', handleHideModal);
        modalElement.addEventListener('hidden.bs.modal', () => {
            if (!isSubmitting) emit('close');
        });
        setTimeout(() => {
            if (modalInstance && modalElement) modalInstance.show();
        }, 100);
    }
    if (confirmModalElement) confirmModalInstance = new Modal(confirmModalElement);
});

onUnmounted(() => {
    const modalElement = document.getElementById(modalId);
    if (modalElement) modalElement.removeEventListener('hide.bs.modal', handleHideModal);
    if (modalInstance) modalInstance.hide();
    if (confirmModalInstance) confirmModalInstance.hide();
});

watch(() => props.object, (newObject) => {
    if (newObject) {
        formData.value = {
            thing_id: newObject.thing_id || newObject.id || uuidv4(),
            name: newObject.name || '',
            description: newObject.description || '',
            start: newObject.start || '',
            end: newObject.end || '',
            public: newObject.public || 0,
            parent_id: props.params.parentId || null,
            parent_link_id: newObject.parent_link_id || null,
            class_id: props.params.classId || (newObject.class?.thing_id || null),
            class_name: props.params.className || (newObject.class?.name || null),
            link_id: newObject.class?.link_id || null,
            type: props.params.type || 3,
        };
        initializeData();
    }
}, { deep: true });
</script>

<style scoped>
.modal-dialog { max-width: 800px; }
.btn-primary { background-color: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin: 10px 0; }
.btn-primary:hover { background-color: #0056b3; }
.btn-secondary { background-color: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
.btn-secondary:hover { background-color: #5a6268; }
.btn-danger { background-color: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
.btn-danger:hover { background-color: #c82333; }
.linked-object-form {
    border: 1px solid #ddd;
    padding: 15px;
    margin-bottom: 15px;
    border-radius: 4px;
}
</style>
