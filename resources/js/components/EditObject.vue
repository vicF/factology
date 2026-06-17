<template>
    <Teleport to="body">
        <!-- Main Edit/Create Modal -->
        <div class="modal fade" :id="modalId" tabindex="-1" :aria-labelledby="modalLabelId" aria-hidden="true">
            <div class="modal-dialog modal-dialog-scrollable modal-fullscreen-sm-down">
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
                                    :link="classLinkData"
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
                                    :link="parentLinkData"
                                    :currentObject="{ thing_id: formData.thing_id, name: formData.name }"
                                    :index="0"
                                    :singleField="true"
                                    :fixedLinkTypeUuid="LINK_TO_PARENT"
                                    :targetLabel="$t('Parent')"
                                    @update="handleParentLinkUpdate"
                                    @remove="handleParentLinkRemove"
                                />
                            </div>

                            <!-- rest of the form (name, description, dates, etc.) -->
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

                            <!-- Public checkbox -->
                            <div class="mb-3 form-check">
                                <input
                                    type="checkbox"
                                    class="form-check-input"
                                    id="publicCheckbox"
                                    v-model="formData.public"
                                    :true-value="1"
                                    :false-value="0"
                                />
                                <label class="form-check-label" for="publicCheckbox">
                                    {{ $t('Public') }}
                                </label>
                                <small class="form-text text-muted d-block">
                                    {{ $t('Make this object visible to everyone') }}
                                </small>
                            </div>

                            <!-- Object type indicator -->
                            <div v-if="formData.type == 1" class="mb-3">General</div>
                            <div v-if="formData.type == CLASS_TYPE" class="mb-3">Class</div>
                            <div v-else-if="formData.type == THING_TYPE" class="mb-3">Thing</div>
                            <div v-else-if="formData.type == LINK_TYPE" class="mb-3">Link</div>
                            <div v-else-if="formData.type == 5" class="mb-3">External</div>
                            <div v-else class="mb-3">!Unknown type!</div>

                            <!-- Top action buttons (same style and order as footer) -->
                            <div class="d-flex gap-2 mb-3 justify-content-end" v-if="regularLinks.length > 0">
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

                            <!-- Display regular links (not special ones) -->
                            <div v-for="(item, idx) in regularLinks" :key="item.id" class="linked-object-form">
                                <LinkedObject
                                    :link="{
                                        one_thing_id: formData.thing_id,
                                        other_thing_id: item.other_thing_id,
                                        link_type_id: item.link_type_id,
                                        translation: item.translation,
                                        link_id: item.link_id
                                    }"
                                    :currentObject="{
                                        thing_id: formData.thing_id,
                                        name: formData.name
                                    }"
                                    :index="idx"
                                    :objectType="formData.type === CLASS_TYPE ? CLASS_TYPE : THING_TYPE"
                                    @update="updateItem"
                                    @remove="removeItem"
                                />
                            </div>

                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <button type="button" class="btn btn-primary" @click="addNewLinkedObject">
                                    {{ $t('Add Link') }}
                                </button>

                                <div class="modal-footer border-0 p-0 m-0">
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
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        <!-- Unsaved Changes Confirmation Modal -->
        <div class="modal fade" :id="confirmModalId" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-sm">
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
    </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { Modal } from 'bootstrap';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from 'vue-i18n';

// CRITICAL: These component imports are required - DO NOT REMOVE
import TextField from './Fields/TextField.vue';
import DateField from './Fields/DateField.vue';
import LinkedObject from './Fields/LinkedObject.vue';

import { CLASS_TYPE, LINK_TO_CLASS, LINK_TO_PARENT, LINK_TYPE, THING_TYPE } from "../constants.js";
import { eventBus } from "../eventBus.js";
import { useObjectsStore } from '@/stores/objects';
import { useObjectCacheStore } from '@/stores/objectCache.js';

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
    thing_id: isEditMode.value ? (props.object.thing_id || props.object.id || uuidv4()) : uuidv4(),
    name: isEditMode.value ? props.object.name || '' : '',
    description: isEditMode.value ? props.object.description || '' : '',
    start: isEditMode.value ? props.object.start || '' : '',
    end: isEditMode.value ? props.object.end || '' : '',
    public: isEditMode.value ? (props.object.public === 1 ? 1 : 0) : 0,
    type: props.params.type || 3,
});

// Cache new UUID immediately so ObjectField doesn't try to fetch a non-existent object
const cacheStore = useObjectCacheStore();
if (!isEditMode.value && formData.value.thing_id && !cacheStore.hasCachedObject(formData.value.thing_id)) {
    cacheStore.cacheObject(formData.value.thing_id, {
        thing_id: formData.value.thing_id,
        name: formData.value.name || 'New Object',
        type: formData.value.type,
    }, formData.value.type);
}

// Special links as full objects (same shape as regular links)
const classLinkData = ref({
    one_thing_id: formData.value.thing_id,
    other_thing_id: '',
    link_type_id: LINK_TO_CLASS,
    translation: '',
    link_id: null,
});

const parentLinkData = ref({
    one_thing_id: formData.value.thing_id,
    other_thing_id: '',
    link_type_id: LINK_TO_PARENT,
    translation: '',
    link_id: null,
});

const linkedObjects = ref([]); // regular links (excluding class and parent)

let modalInstance = null;
let confirmModalInstance = null;
let isClosing = false;
let isSubmitting = false;

// Unsaved changes tracking
const originalFormData = ref({});
const originalLinkedObjects = ref([]);
const originalClassLink = ref(null);
const originalParentLink = ref(null);

const hasUnsavedChanges = computed(() => {
    if (isSubmitting) return false;

    const formChanged = Object.keys(originalFormData.value).some(key => {
        const original = originalFormData.value[key] || '';
        const current = formData.value[key] || '';
        return original !== current;
    });

    const linksChanged = JSON.stringify(originalLinkedObjects.value) !== JSON.stringify(linkedObjects.value);
    const classLinkChanged = JSON.stringify(originalClassLink.value) !== JSON.stringify(classLinkData.value);
    const parentLinkChanged = JSON.stringify(originalParentLink.value) !== JSON.stringify(parentLinkData.value);

    return formChanged || linksChanged || classLinkChanged || parentLinkChanged;
});

// Regular links (all links except class and parent)
const regularLinks = computed(() => linkedObjects.value);

// Event handlers
const handleClassLinkUpdate = ({ data }) => {
    classLinkData.value = { ...classLinkData.value, ...data };
};

const handleClassLinkRemove = () => {
    classLinkData.value.other_thing_id = '';
    classLinkData.value.link_id = null;
};
const handleParentLinkUpdate = ({ data }) => {
    parentLinkData.value = { ...parentLinkData.value, ...data };
};
const handleParentLinkRemove = () => {
    parentLinkData.value.other_thing_id = '';
    parentLinkData.value.link_id = null;
};

const modalId = `editObjectModal-${formData.value.thing_id}`;
const modalLabelId = `editObjectModalLabel-${formData.value.thing_id}`;
const confirmModalId = `confirmModal-${formData.value.thing_id}`;

// Guards for recursive initialization
const isInitializing = ref(false);
const lastInitializedId = ref(null);

// Initialize data
const initializeData = () => {
    if (isInitializing.value) return;
    isInitializing.value = true;

    linkedObjects.value = [];

    // Reset special links
    classLinkData.value = {
        one_thing_id: formData.value.thing_id,
        other_thing_id: '',
        link_type_id: LINK_TO_CLASS,
        translation: '',
        link_id: null,
    };
    parentLinkData.value = {
        one_thing_id: formData.value.thing_id,
        other_thing_id: '',
        link_type_id: LINK_TO_PARENT,
        translation: '',
        link_id: null,
    };

    // Process initialLinkedObjects
    props.initialLinkedObjects.forEach(item => {
        const linkItem = {
            one_thing_id: item.one_thing_id || '',
            other_thing_id: item.other_thing_id || '',
            link_type_id: item.link_type_id || '',
            translation: item.description || item.translation || '',
            link_id: item.linkId || null,
        };

        if (formData.value.type === THING_TYPE && item.link_type_id === LINK_TO_CLASS) {
            classLinkData.value = { ...classLinkData.value, ...linkItem };
            return;
        }

        if (formData.value.type === CLASS_TYPE && item.link_type_id === LINK_TO_PARENT) {
            const parentId = linkItem.one_thing_id || linkItem.other_thing_id;
            if (parentId) {
                parentLinkData.value.other_thing_id = parentId;
                parentLinkData.value.link_id = linkItem.link_id;
                parentLinkData.value.translation = linkItem.translation;
            }
            console.log('[EditObject] parentLinkData set to:', JSON.parse(JSON.stringify(parentLinkData.value)));
            return;
        }

        linkedObjects.value.push(linkItem);
    });

    // For edit mode, also read from existing object
    if (isEditMode.value && props.object) {
        if (formData.value.type === THING_TYPE && props.object.class?.thing_id && !classLinkData.value.other_thing_id) {
            classLinkData.value.other_thing_id = props.object.class.thing_id;
            classLinkData.value.link_id = props.object.class?.link_id || null;
        }
        if (formData.value.type === CLASS_TYPE && props.object.links) {
            const parentLinkFromLinks = props.object.links.find(link => link.link_type_id === LINK_TO_PARENT);
            if (parentLinkFromLinks) {
                let parentId;
                if (parentLinkFromLinks.one_thing_id === props.object.thing_id) {
                    parentId = parentLinkFromLinks.other_thing_id;
                } else {
                    parentId = parentLinkFromLinks.one_thing_id;
                }
                parentLinkData.value.other_thing_id = parentId;
                parentLinkData.value.link_id = parentLinkFromLinks.link_id;
                parentLinkData.value.translation = parentLinkFromLinks.translation || '';
                console.log('[EditObject] parentLinkData updated from existing links:', JSON.parse(JSON.stringify(parentLinkData.value)));
            }
        }
    }

    // Store original state
    originalFormData.value = JSON.parse(JSON.stringify(formData.value));
    originalLinkedObjects.value = JSON.parse(JSON.stringify(linkedObjects.value));
    originalClassLink.value = JSON.parse(JSON.stringify(classLinkData.value));
    originalParentLink.value = JSON.parse(JSON.stringify(parentLinkData.value));

    isInitializing.value = false;
};

initializeData();

// Helper methods
const addNewLinkedObject = () => {
    linkedObjects.value.push({
        id: uuidv4(),
        one_thing_id: formData.value.thing_id,
        other_thing_id: '',
        link_type_id: '2da45f14-69c6-4d56-9f2f-809fda14abf5',
        translation: '',
        link_id: null,
    });
};

const updateItem = ({ index, data }) => {
    linkedObjects.value[index] = { ...linkedObjects.value[index], ...data };
};

const removeItem = (index) => {
    linkedObjects.value.splice(index, 1);
};

const confirmClose = () => {
    if (document.activeElement?.blur) document.activeElement.blur();
    if (confirmModalInstance) confirmModalInstance.hide();
    const modalElement = document.getElementById(modalId);
    if (modalElement && modalInstance) {
        modalElement.removeEventListener('hide.bs.modal', handleHideModal);
        modalInstance.hide();
    }
    emit('close');
};

const handleHideModal = (event) => {
    if (document.activeElement?.blur) document.activeElement.blur();
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

        const linksToAdd = regularLinks.value
            .filter(item => item.other_thing_id?.trim() && !item.link_id)
            .map(item => ({
                one_thing_id: formData.value.thing_id,
                link_type_id: item.link_type_id,
                other_thing_id: item.other_thing_id,
                description: item.translation || '',
                public: 0,
            }));

        const payload = {
            thing_id: formData.value.thing_id,
            name: formData.value.name,
            description: formData.value.description,
            start: formData.value.start || null,
            end: formData.value.end || null,
            public: formData.value.public,
            type: formData.value.type,
        };

        if (formData.value.type === THING_TYPE && classLinkData.value.other_thing_id) {
            payload.class = {
                one_thing_id: formData.value.thing_id,
                link_type_id: LINK_TO_CLASS,
                other_thing_id: classLinkData.value.other_thing_id,
                description: classLinkData.value.translation || '',
                link_id: classLinkData.value.link_id || undefined,
                public: 1,
            };
        }

        if (formData.value.type === CLASS_TYPE && parentLinkData.value.other_thing_id) {
            payload.parent = {
                one_thing_id: parentLinkData.value.other_thing_id,
                link_type_id: LINK_TO_PARENT,
                other_thing_id: formData.value.thing_id,
                description: parentLinkData.value.translation || '',
                link_id: parentLinkData.value.link_id || undefined,
                public: 1,
            };
        }

        if (linksToAdd.length > 0) payload.links_to_add = linksToAdd;

        if (isEditMode.value) {
            const linksToUpdate = regularLinks.value
                .filter(item => item.link_id && item.other_thing_id?.trim())
                .map(item => ({
                    link_id: item.link_id,
                    one_thing_id: formData.value.thing_id,
                    other_thing_id: item.other_thing_id,
                    link_type_id: item.link_type_id,
                    translation: item.translation,
                }));
            if (linksToUpdate.length > 0) payload.links_to_update = linksToUpdate;

            const linksToDelete = originalLinkedObjects.value
                .filter(orig => orig.link_id && !regularLinks.value.find(curr => curr.link_id === orig.link_id))
                .map(orig => orig.link_id);
            if (linksToDelete.length > 0) payload.links_to_delete = linksToDelete;
        }

        console.log('[EditObject] Final payload:', JSON.parse(JSON.stringify(payload)));

        let response;
        if (isEditMode.value) {
            response = await axios.put(`/object/${formData.value.thing_id}`, payload);
            cacheStore.cacheObject(formData.value.thing_id, response.data.data || response.data, formData.value.type);
            emit('object-updated', response.data);
            if (formData.value.type === CLASS_TYPE) {
                const oldParentId = props.object?.parent_id;
                const newParentId = parentLinkData.value.other_thing_id;
                if (oldParentId !== newParentId) {
                    objectsStore.moveClassInTree(formData.value.thing_id, newParentId);
                }
                objectsStore.updateClassInTree(formData.value.thing_id, formData.value.name);
            }
        } else {
            response = await axios.post(`/object/${formData.value.thing_id}`, payload);
            // Update cache with real saved data
            cacheStore.cacheObject(formData.value.thing_id, response.data.data || response.data, formData.value.type);
            emit('object-created', response.data);
            if (formData.value.type === CLASS_TYPE) {
                objectsStore.addClassToTree(formData.value.thing_id, formData.value.name, parentLinkData.value.other_thing_id);
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

        if (document.activeElement?.blur) document.activeElement.blur();
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

watch(() => props.object, (newObject, oldObject) => {
    if (!newObject) return;
    const newId = newObject.thing_id || newObject.id;
    const oldId = oldObject?.thing_id || oldObject?.id;
    if (newId === oldId && lastInitializedId.value === newId) return;
    lastInitializedId.value = newId;

    formData.value = {
        thing_id: newObject.thing_id || newObject.id || uuidv4(),
        name: newObject.name || '',
        description: newObject.description || '',
        start: newObject.start || '',
        end: newObject.end || '',
        public: newObject.public === 1 ? 1 : 0,
        type: props.params.type || 3,
    };
    initializeData();
}, { deep: false });
</script>

<style scoped>
.modal-dialog {
    max-width: 800px;
}

/* Mobile responsive styles */
@media (max-width: 767.98px) {
    .modal-dialog {
        margin: 0.5rem;
        max-width: calc(100% - 1rem);
    }

    .modal-content {
        border-radius: 12px;
        overflow: hidden;
    }

    .modal-body {
        padding: 1rem;
        max-height: 70vh;
        overflow-y: auto;
    }

    .linked-object-form {
        padding: 10px;
        margin-bottom: 10px;
    }

    .btn-primary, .btn-secondary {
        padding: 8px 16px;
        font-size: 14px;
    }
}

@media (max-width: 480px) {
    .modal-body {
        padding: 0.75rem;
    }

    .linked-object-form {
        padding: 8px;
    }

    .modal-footer {
        flex-direction: column;
        gap: 8px;
    }

    .modal-footer .btn {
        width: 100%;
        margin: 0;
    }
}

.btn-primary {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-primary:hover {
    background-color: #0056b3;
}
.btn-secondary {
    background-color: #6c757d;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-secondary:hover {
    background-color: #5a6268;
}
.btn-danger {
    background-color: #dc3545;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
}
.btn-danger:hover {
    background-color: #c82333;
}
.linked-object-form {
    border: 1px solid #ddd;
    padding: 15px;
    margin-bottom: 15px;
    border-radius: 4px;
}

/* Public checkbox styling */
.form-check {
    padding-left: 1.8em;
}

.form-check-input {
    width: 1.2em;
    height: 1.2em;
    margin-top: 0.15em;
    margin-left: -1.8em;
}

.form-check-label {
    font-weight: 500;
    cursor: pointer;
}

.form-text {
    font-size: 0.75rem;
    margin-top: 0.25rem;
}
</style>
