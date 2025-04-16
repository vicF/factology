<!-- resources/js/components/EditObjectModal.vue -->
<template>
    <div class="modal fade" :id="modalId" tabindex="-1" :aria-labelledby="modalLabelId" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" :id="modalLabelId">{{ isEditMode ? `Edit ${type}` : `Create ${type}` }}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" @click="closeModal"></button>
                </div>
                <div class="modal-body">
                    <form @submit.prevent="submitForm">
                        <div class="mb-3">
                            <label for="link" class="form-label">Link</label>
                            <input type="text" class="form-control" id="link" v-model="formData.link" required>
                        </div>
                        <div class="mb-3">
                            <label for="name" class="form-label">Name</label>
                            <input type="text" class="form-control" id="name" v-model="formData.name" required>
                        </div>
                        <div class="mb-3">
                            <label for="description" class="form-label">Description</label>
                            <textarea class="form-control" id="description" v-model="formData.description"></textarea>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" @click="closeModal">Close</button>
                            <button type="submit" class="btn btn-primary">{{ isEditMode ? 'Update' : 'Save' }}</button>
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

export default {
    name: 'EditObjectModal',
    props: {
        type: { type: String, required: true },
        params: { type: Object, default: () => ({}) },
        object: { type: Object, default: null } // New prop for editing
    },
    emits: ['close', 'object-created', 'object-updated'],
    setup(props, { emit }) {
        const formData = ref({
            link: '',
            name: '',
            description: '',
            type: props.type,
            parentId: props.params.parentId || null,
            classId: props.params.classId || null
        });

        const isEditMode = computed(() => !!props.object);

        // Pre-fill form for edit mode
        if (isEditMode.value) {
            formData.value = {
                ...formData.value,
                link: props.object.link || '',
                name: props.object.name || '',
                description: props.object.description || '',
                id: props.object.id || null // Include ID for PUT request
            };
        }

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
                if (isEditMode.value) {
                    // Edit mode: PUT request
                    response = await axios.put(`/api/v1/object/${formData.value.id}`, formData.value);
                    emit('object-updated', response.data);
                } else {
                    // Create mode: POST request
                    const id = props.params.classId || props.params.parentId || 'create';
                    response = await axios.post(`/api/v1/object/${id}`, formData.value);
                    emit('object-created', response.data);
                }
                closeModal();
            } catch (error) {
                console.error('Error:', error);
                alert('Failed: ' + (error.response?.data?.message || error.message));
            }
        };

        return { formData, modalId, modalLabelId, closeModal, submitForm, isEditMode };
    }
};
</script>
