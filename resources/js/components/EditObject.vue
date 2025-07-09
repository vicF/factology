<template>
    <div class="modal fade" :id="modalId" tabindex="-1" :aria-labelledby="modalLabelId" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" :id="modalLabelId">{{ title || (isEditMode ? $t('Edit Object') : $t('Create Object')) }}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" @click="closeModal"></button>
                </div>
                <div class="modal-body">
                    <form @submit.prevent="submitForm">
                        <div v-for="(item, index) in linkedObjects" :key="index">
                            <LinkedObject
                                :current-object-u-u-i-d="formData.thing_id"
                                :linked-object-u-u-i-d="item.linkedObjectUUID"
                                :link-type-u-u-i-d="item.linkTypeUUID"
                                :comment="item.comment"
                                :index="index"
                                @update="updateItem"
                                @remove="removeItem"
                            />
                        </div>
                        <button type="button" class="btn btn-primary" @click="addNewLinkedObject">
                            {{ $t('Add Link') }}
                        </button>
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
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" @click="closeModal">{{ $t('Close') }}</button>
                            <button type="submit" class="btn btn-primary">{{ isEditMode ? $t('Update') : $t('Save') }}</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import axios from 'axios';
import { Modal } from 'bootstrap';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from 'vue-i18n';
import TextField from './Fields/TextField.vue';
import ObjectField from './Fields/ObjectField.vue';
import DateField from './Fields/DateField.vue';
import RadioGroupField from './Fields/RadioGroupField.vue';
import LinkedObject from './Fields/LinkedObject.vue';

export default {
    name: 'EditObject',
    components: { LinkedObject, ObjectField, TextField, DateField, RadioGroupField },
    props: {
        object: { type: Object, default: null },
        params: { type: Object, default: () => ({})},
        title: {type: String, default: ''}, // Title from event
        initialLinkedObjects: {
            type: Array,
            default: () => [],
        },
    },
    emits: ['close', 'object-created', 'object-updated'],
    setup(props, {emit}) {
        const {t} = useI18n();
        const isEditMode = computed(() => !!props.object);

        console.log('EditObject.vue - Props:', {object: props.object, params: props.params, title: props.title});

        const formData = ref({
            thing_id: isEditMode.value ? (props.object.thing_id || props.object.id || uuidv4()) : uuidv4(),
            name: isEditMode.value ? props.object.name || '' : '',
            description: isEditMode.value ? props.object.description || '' : '',
            start: isEditMode.value ? props.object.start || '' : '',
            end: isEditMode.value ? props.object.end || '' : '',
            public: isEditMode.value ? props.object.public || 0 : 0,
            parent_id: props.params.parentId || null,
            class_id: props.params.classId || null,
            class_name: props.params.className || null,
            type: props.params.type || 3, // Default to 3 for objects, override for subclasses
        });

        const linkedObjects = ref([]);

        // Initialize linkedObjects with initial data
        onMounted(() => {
            linkedObjects.value = props.initialLinkedObjects.map((item) => ({
                currentObjectUUID: formData.value.thing_id,
                linkedObjectUUID: item.linkedObjectUUID || '',
                linkTypeUUID: item.linkTypeUUID || '',
                comment: item.comment || '',
            }));
            // Add an empty linked object if none exist
            if (linkedObjects.value.length === 0) {
                addNewLinkedObject();
            }

            const modalElement = document.getElementById(modalId);
            if (modalElement) {
                modalInstance = new Modal(modalElement);
                modalInstance.show();
                modalElement.addEventListener('hidden.bs.modal', () => emit('close'));
            } else {
                console.error('EditObject.vue - Modal element not found:', modalId);
            }
        });

        const modalId = `editObjectModal-${formData.value.thing_id}`;
        const modalLabelId = `editObjectModalLabel-${formData.value.thing_id}`;
        let modalInstance = null;

        onUnmounted(() => {
            const modalElement = document.getElementById(modalId);
            if (modalElement) {
                modalElement.removeEventListener('hidden.bs.modal', () => {
                });
            }
            if (modalInstance) {
                modalInstance.dispose();
            }
        });

        const addNewLinkedObject = () => {
            linkedObjects.value.push({
                currentObjectUUID: formData.value.thing_id,
                linkedObjectUUID: '',
                linkTypeUUID: '',
                comment: '',
            });
        };

        const updateItem = ({index, data}) => {
            linkedObjects.value[index] = data;
        };

        const removeItem = (index) => {
            linkedObjects.value.splice(index, 1);
        };

        const closeModal = () => {
            if (modalInstance) modalInstance.hide();
        };

        const submitForm = async () => {
            try {
                await axios.get('/sanctum/csrf-cookie');
                let response;

                // Filter out empty linked objects and prepare payload
                const validLinkedObjects = linkedObjects.value.filter(
                    (item) => item.linkedObjectUUID || item.linkTypeUUID || item.comment
                );

                const payload = {
                    thing_id: formData.value.thing_id,
                    name: formData.value.name,
                    description: formData.value.description,
                    start: formData.value.start,
                    end: formData.value.end,
                    public: formData.value.public,
                    parent_id: formData.value.parent_id,
                    class_id: formData.value.class_id,
                    type: formData.value.type,
                    linked_objects: validLinkedObjects.map((item) => ({
                        linked_object_id: item.linkedObjectUUID,
                        link_type_id: item.linkTypeUUID,
                        comment: item.comment,
                    })),
                };

                if (isEditMode.value) {
                    console.log('EditObject.vue - Sending PUT to /api/v1/object/' + formData.value.thing_id + ' with body:', payload);
                    response = await axios.put(`/api/v1/object/${formData.value.thing_id}`, payload);
                    console.log('EditObject.vue - Object updated:', response.data);
                    emit('object-updated', response.data);
                } else {
                    console.log('EditObject.vue - Sending POST to /api/v1/object/' + formData.value.thing_id + ' with body:', payload);
                    response = await axios.post(`/api/v1/object/${formData.value.thing_id}`, payload);
                    console.log('EditObject.vue - Object created:', response.data);
                    emit('object-created', response.data);
                }

                closeModal();
            } catch (error) {
                console.error('EditObject.vue - Submit error:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message,
                });
                alert(t('Failed') + ': ' + (error.response?.data?.message || error.response?.data?.error || error.message));
            }
        };

        return {
            formData,
            linkedObjects,
            modalId,
            modalLabelId,
            closeModal,
            submitForm,
            isEditMode,
            addNewLinkedObject,
            updateItem,
            removeItem,
            t,
        };
    },
};
</script>

<style scoped>
.modal-dialog {
    max-width: 800px;
}

.btn-primary {
    background-color: #007bff;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    margin: 10px 0;
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
</style>
