<!-- factology/resources/js/components/EditObject.vue -->
<template>
    <div class="modal fade" :id="modalId" tabindex="-1" :aria-labelledby="modalLabelId" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" :id="modalLabelId">{{ isEditMode ? $t('Edit Object') : $t('Create Object') }}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" @click="closeModal"></button>
                </div>
                <div class="modal-body">
                    <form @submit.prevent="submitForm">
                        <div class="mb-3">
                            <TextField
                                fieldName="class"
                                v-model="formData.class"
                                :isEditable="true"
                                :label="$t('Class')"
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
import DateField from './Fields/DateField.vue';
import RadioGroupField from './Fields/RadioGroupField.vue';

export default {
    name: 'EditObject',
    components: { TextField, DateField, RadioGroupField },
    props: {
        object: { type: Object, default: null }, // Existing object for editing
        params: { type: Object, default: () => ({}) }, // Additional params (e.g., parentId, classId)
    },
    emits: ['close', 'object-created', 'object-updated'],
    setup(props, { emit }) {
        const { t } = useI18n();
        const isEditMode = computed(() => !!props.object);

        // Initialize form data
        console.log('EditObject.vue - Props object:', props.object);

        const formData = ref({
            thing_id: isEditMode.value ? (props.object.thing_id || props.object.id || uuidv4()) : uuidv4(),
            name: isEditMode.value ? props.object.name || '' : '',
            description: isEditMode.value ? props.object.description || '' : '',
            start: isEditMode.value ? props.object.start || '' : '',
            end: isEditMode.value ? props.object.end || '' : '',
            public: isEditMode.value ? props.object.public || 0 : 0,
            parentId: props.params.parentId || null,
            classId: props.params.classId || null,
        });

        console.log('EditObject.vue - Form data initialized:', formData.value);

        const modalId = 'editObjectModal';
        const modalLabelId = 'editObjectModalLabel';
        let modalInstance = null;

        onMounted(() => {
            const modalElement = document.getElementById(modalId);
            modalInstance = new Modal(modalElement);
            modalInstance.show();
            modalElement.addEventListener('hidden.bs.modal', () => emit('close'));
        });

        onUnmounted(() => {
            const modalElement = document.getElementById(modalId);
            if (modalElement) {
                modalElement.removeEventListener('hidden.bs.modal', () => {});
            }
            if (modalInstance) {
                modalInstance.dispose();
            }
        });

        const closeModal = () => {
            if (modalInstance) modalInstance.hide();
        };

        const submitForm = async () => {
            try {
                await axios.get('/sanctum/csrf-cookie');
                let response;

                // Prepare payload
                const payload = {
                    thing_id: formData.value.thing_id,
                    name: formData.value.name,
                    description: formData.value.description,
                    start: formData.value.start,
                    end: formData.value.end,
                    public: formData.value.public,
                    parentId: formData.value.parentId,
                    classId: formData.value.classId,
                    type: 3,
                };

                //if (isEditMode.value) {
                    // Edit mode: PUT request to /api/v1/object/{uuid}
                    console.log('EditObject.vue - Sending PUT to /api/v1/object/' + formData.value.id + ' with body:', payload);
                    response = await axios.put(`/api/v1/object/${formData.value.id}`, payload);
                    console.log('EditObject.vue - Object updated:', response.data);
                    emit('object-updated', response.data);
                /*} else {
                    // Create mode: POST request to /api/v1/object
                    console.log('EditObject.vue - Sending POST to /api/v1/object with body:', payload);
                    response = await axios.post('/api/v1/object', payload);
                    console.log('EditObject.vue - Object created:', response.data);
                    emit('object-created', response.data);
                }*/
                closeModal();
            } catch (error) {
                console.error('EditObject.vue - Submit error:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    message: error.message,
                });
                alert(t('Failed') + ': ' + (error.response?.data?.message || error.message));
            }
        };

        return { formData, modalId, modalLabelId, closeModal, submitForm, isEditMode, t };
    },
};
</script>
