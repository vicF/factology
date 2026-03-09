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
                        <div class="mb-3">
                            <RadioGroupField
                                fieldName="visibility"
                                v-model="formData.public"
                                :options="{ 0: $t('Private'), 1: $t('Public') }"
                                :isEditable="true"
                                :label="$t('Access')"
                            />
                        </div>

                        <button type="button" class="btn btn-primary mb-3" @click="addNewLinkedObject">
                            {{ $t('Add Link') }}
                        </button>

                        <div v-for="item in linkedObjects" :key="item.id" class="linked-object-form">
                            <LinkedObject
                                :current-object-uuid="formData.thing_id"
                                :current-object-name="formData.name"
                                :linked-object-uuid="item.otherThingUuid"
                                :link-type-uuid="item.linkTypeUuid"
                                :comment="item.comment"
                                :link-id="item.linkId"
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
import RadioGroupField from './Fields/RadioGroupField.vue';
import LinkedObject from './Fields/LinkedObject.vue';
import {CLASS_TYPE, LINK_TO_CLASS, LINK_TO_PARENT} from "../constants.js";
import {eventBus} from "../eventBus.js";

// Props definition
const props = defineProps({
    object: { type: Object, default: null },
    params: { type: Object, default: () => ({}) },
    title: { type: String, default: '' },
    initialLinkedObjects: { type: Array, default: () => [] },
    parentObjectId: { type: String, default: null },
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

// Unsaved changes tracking
const originalFormData = ref({});
const originalLinkedObjects = ref([]);

const hasUnsavedChanges = computed(() => {
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
                oneThingUuid: formData.value.thing_id,
                otherThingUuid: item.other_thing_id || '',
                linkTypeUuid: item.link_type_id || '',
                comment: item.description || '',
                linkId: item.link_id || null,
            }));
    } else {
        // For new objects, also use initialLinkedObjects if provided
        if (props.initialLinkedObjects && props.initialLinkedObjects.length > 0) {
            linkedObjects.value = props.initialLinkedObjects.map(item => ({
                id: uuidv4(),
                oneThingUuid: formData.value.thing_id,
                otherThingUuid: item.other_thing_id || item.otherThingUuid || '',
                linkTypeUuid: item.link_type_id || item.linkTypeUuid || '',
                comment: item.description || item.comment || '',
                linkId: item.link_id || item.linkId || null,
            }));
        } else if (props.parentObjectId) {
            // Fallback to parentObjectId for backward compatibility
            linkedObjects.value = [{
                id: uuidv4(),
                oneThingUuid: formData.value.thing_id,
                otherThingUuid: props.parentObjectId,
                linkTypeUuid: props.parentLinkType,
                comment: '',
                linkId: null,
            }];
        } else {
            linkedObjects.value = [];
        }
    }

    // Store original state for unsaved changes detection
    originalFormData.value = JSON.parse(JSON.stringify(formData.value));
    originalLinkedObjects.value = JSON.parse(JSON.stringify(linkedObjects.value));
};

// Call initialize
initializeData();

// Methods
const addNewLinkedObject = () => {
    linkedObjects.value.push({
        id: uuidv4(),
        oneThingUuid: formData.value.thing_id,
        otherThingUuid: '',
        linkTypeUuid: '2da45f14-69c6-4d56-9f2f-809fda14abf5',
        comment: '',
        linkId: null,
    });
};

const updateItem = ({ index, data }) => {
    linkedObjects.value[index] = { ...linkedObjects.value[index], ...data };
};

const removeItem = (index) => {
    linkedObjects.value.splice(index, 1);
};

const confirmClose = () => {
    confirmModalInstance?.hide();

    // Now force close the main modal
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
        // Temporarily remove the hide event listener to avoid recursion
        modalElement.removeEventListener('hide.bs.modal', handleHideModal);
        modalInstance?.hide();
        // Re-attach the listener after a short delay
        setTimeout(() => {
            modalElement.addEventListener('hide.bs.modal', handleHideModal);
        }, 100);
    }
};

// Handle modal hide event (triggered by close buttons, Esc key, or backdrop click)
const handleHideModal = (event) => {
    if (hasUnsavedChanges.value) {
        // Prevent the modal from hiding
        event.preventDefault();
        event.stopPropagation();

        // Show confirmation dialog
        confirmModalInstance?.show();
    }
};

const submitForm = async () => {
    try {
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
        } else {
            response = await axios.post(`/object/${formData.value.thing_id}`, payload);
            emit('object-created', response.data);
            if (props.callback && props.callback.type === 'link-created') {
                // Emit event with the new object ID
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

        modalInstance?.hide();
    } catch (error) {
        console.error('Submit error:', error.response || error);
        alert(t('Failed') + ': ' + (error.response?.data?.message || error.message));
    }
};

// Lifecycle hooks
onMounted(async () => {
    // Wait for next tick to ensure DOM is ready
    await nextTick();

    const modalElement = document.getElementById(modalId);
    const confirmModalElement = document.getElementById(confirmModalId);

    if (modalElement) {
        modalInstance = new Modal(modalElement);

        // Add hide event listener to intercept close attempts
        modalElement.addEventListener('hide.bs.modal', handleHideModal);
        modalElement.addEventListener('hidden.bs.modal', () => emit('close'));

        // Small delay to ensure Bootstrap is ready
        setTimeout(() => {
            modalInstance.show();
        }, 100);
    }

    if (confirmModalElement) {
        confirmModalInstance = new Modal(confirmModalElement);
    }
});

onUnmounted(() => {
    const modalElement = document.getElementById(modalId);
    if (modalElement) {
        modalElement.removeEventListener('hide.bs.modal', handleHideModal);
    }
    if (modalInstance) modalInstance.dispose();
    if (confirmModalInstance) confirmModalInstance.dispose();
});

// Watch for object changes to reset original state
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
