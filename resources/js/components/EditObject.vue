<!-- Dialog to create new or edit existing object, including it's name, dates etc. -->
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
                        <div class="mb-3" v-if="formData.type === 2">
                            <TextField
                                fieldName="parent_id"
                                v-model="formData.parent_id"
                                :isEditable="true"
                                :label="$t('Parent')"
                                required
                            />
                        </div>
                        <div class="mb-3" v-if="formData.type === 3">
                            <ObjectField
                                fieldName="class_id"
                                v-model="formData.class_id"
                                :isEditable="true"
                                :label="$t('Class')"
                                :name="formData.class_name"
                                :type="CLASS_TYPE"
                                required
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
                        <div v-if="formData.type == 1" class="mb-3">
                            General
                        </div>
                        <div v-if="formData.type == 2" class="mb-3">
                            Class
                        </div>
                        <div v-else-if="formData.type == 3" class="mb-3">
                            Thing
                        </div>
                        <div v-else-if="formData.type == 4" class="mb-3">
                            Link
                        </div>
                        <div v-else-if="formData.type == 5" class="mb-3">
                            External
                        </div>
                        <div v-else class="mb-3">
                            !Unknown type!
                        </div>

                        <button type="button" class="btn btn-primary mb-3" @click="addNewLinkedObject">
                            {{ $t('Add Link') }}
                        </button>

                        <div v-for="item in linkedObjects" :key="item.id" class="linked-object-form">
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
import {ref, computed, onMounted, onUnmounted, watch, nextTick} from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { Modal } from 'bootstrap';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from 'vue-i18n';
import TextField from './Fields/TextField.vue';
import ObjectField from './Fields/ObjectField.vue';
import DateField from './Fields/DateField.vue';
import LinkedObject from './Fields/LinkedObject.vue';
import {CLASS_TYPE, LINK_TO_CLASS, LINK_TO_PARENT} from "../constants.js";
import {eventBus} from "../eventBus.js";
import { useObjectsStore } from '@/stores/objects';

const objectsStore = useObjectsStore();

// Props definition
const props = defineProps({
    object: { type: Object, default: null },
    params: { type: Object, default: () => ({}) },
    title: { type: String, default: '' },
    initialLinkedObjects: { type: Array, default: () => [] },
    parentObjectId: { type: String, default: null },
    parentObject: { type: Object, default: null },
    parentLinkType: { type: String, default: '2da45f14-69c6-4d56-9f2f-809fda14abf5' },
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
    class_id: props.params.classId || props.object?.class?.thing_id || null,
    class_name: props.params.className || props.object?.class?.name || null,
    type: props.params.type || 3,
    link_id: props.object?.class?.link_id || null,
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

    // Check form data changes
    const formChanged = Object.keys(originalFormData.value).some(key => {
        // Handle null/undefined/empty string equality
        const original = originalFormData.value[key] || '';
        const current = formData.value[key] || '';
        return original !== current;
    });

    // Check linked objects changes
    const linksChanged = JSON.stringify(originalLinkedObjects.value) !== JSON.stringify(linkedObjects.value);

    return formChanged || linksChanged;
});

// Modal IDs
const modalId = `editObjectModal-${formData.value.thing_id}`;
const modalLabelId = `editObjectModalLabel-${formData.value.thing_id}`;
const confirmModalId = `confirmModal-${formData.value.thing_id}`;

// Initialize data and store original state
const initializeData = () => {
    // Initialize linked objects
    if (isEditMode.value) {
        linkedObjects.value = props.initialLinkedObjects
            .filter(item => item.link_type_id !== 'c217c185-742f-4a9f-8e69-acea2b4f5aea')
            .map(item => ({
                id: uuidv4(),
                otherThingUuid: item.other_thing_id || '',
                linkTypeUuid: item.link_type_id || '',
                comment: item.description || '',
                linkId: item.link_id || null,
            }));
    } else {
        if (props.initialLinkedObjects && props.initialLinkedObjects.length > 0) {
            linkedObjects.value = props.initialLinkedObjects.map(item => ({
                id: uuidv4(),
                otherThingUuid: item.other_thing_id || item.otherThingUuid || '',
                linkTypeUuid: item.link_type_id || item.linkTypeUuid || '',
                comment: item.description || item.comment || '',
                linkId: item.link_id || item.linkId || null,
            }));
        } else if (props.parentObject) {
            linkedObjects.value = [{
                id: uuidv4(),
                otherThingUuid: props.parentObject.thing_id,
                linkTypeUuid: props.parentLinkType,
                comment: '',
                linkId: null,
            }];
        } else if (props.parentObjectId) {
            linkedObjects.value = [{
                id: uuidv4(),
                otherThingUuid: props.parentObjectId,
                linkTypeUuid: props.parentLinkType,
                comment: '',
                linkId: null,
            }];
        } else {
            linkedObjects.value = [];
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
    if (confirmModalInstance) {
        confirmModalInstance.hide();
        // Don't dispose immediately, let Bootstrap finish
        /*setTimeout(() => {
            if (confirmModalInstance) {
                confirmModalInstance.dispose();
                confirmModalInstance = null;
            }
        }, 300);*/
    }

    const modalElement = document.getElementById(modalId);
    if (modalElement && modalInstance) {
        modalElement.removeEventListener('hide.bs.modal', handleHideModal);
        modalInstance.hide();
        // Don't dispose immediately, let Bootstrap finish
        /*setTimeout(() => {
            if (modalInstance) {
                modalInstance.dispose();
                modalInstance = null;
            }
        }, 300);*/
    }

    emit('close');
};

const handleHideModal = (event) => {
    // Check if the modal element still exists in DOM and modal instance exists
    const modalElement = document.getElementById(modalId);
    if (!modalElement || !modalInstance) {
        // Modal already removed from DOM or destroyed, ignore the event
        event.preventDefault();
        event.stopPropagation();
        return;
    }

    if (hasUnsavedChanges.value && !isClosing && !isSubmitting) {
        event.preventDefault();
        event.stopPropagation();
        if (confirmModalInstance) {
            confirmModalInstance.show();
        }
    }
};


const submitForm = async () => {
    if (isSubmitting) return;

    try {
        isSubmitting = true;

        const linksToAdd = linkedObjects.value
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

        if (formData.value.class_id) {
            payload.class = {
                one_thing_id: formData.value.thing_id,
                link_type_id: LINK_TO_CLASS,
                other_thing_id: formData.value.class_id,
                description: '',
                link_id: formData.value.link_id || undefined,
                public: 1,
            };
        }

        if (formData.value.parent_id) {
            payload.class = {
                one_thing_id: formData.value.thing_id,
                link_type_id: LINK_TO_PARENT,
                other_thing_id: formData.value.parent_id,
                description: '',
                link_id: formData.value.link_id || undefined,
                public: 1,
            };
        }

        if (linksToAdd.length > 0) {
            payload.links_to_add = linksToAdd;
        }

        let response;
        if (isEditMode.value) {
            response = await axios.put(`/object/${formData.value.thing_id}`, payload);
            emit('object-updated', response.data);

            // Update class in store directly if it's a class
            if (formData.value.type === 2) {
                objectsStore.updateClassInTree(formData.value.thing_id, formData.value.name);
            }
        } else {
            response = await axios.post(`/object/${formData.value.thing_id}`, payload);
            emit('object-created', response.data);

            // Add class to store directly if it's a class
            if (formData.value.type === 2) {
                objectsStore.addClassToTree(
                    formData.value.thing_id,
                    formData.value.name,
                    formData.value.parent_id
                );
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

            if (props.parentObjectId) {
                router.push({ name: 'object', params: { id: props.parentObjectId } });
            }
        }

        const modalElement = document.getElementById(modalId);
        if (modalElement) {
            modalElement.removeEventListener('hide.bs.modal', handleHideModal);
        }
        // Simply hide modal, don't dispose immediately
        if (modalInstance) {
            modalInstance.hide();
        }

        // Close after Bootstrap animation completes
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
            if (!isSubmitting) {
                emit('close');
            }
        });
        setTimeout(() => {
            if (modalInstance && modalElement) {
                modalInstance.show();
            }
        }, 100);
    }

    if (confirmModalElement) {
        confirmModalInstance = new Modal(confirmModalElement);
    }
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
            class_id: props.params.classId || newObject.class?.thing_id || null,
            class_name: props.params.className || newObject.class?.name || null,
            type: props.params.type || 3,
            link_id: newObject.class?.link_id || null,
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
