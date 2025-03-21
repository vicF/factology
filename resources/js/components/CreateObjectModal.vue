<!-- resources/js/components/CreateObjectModal.vue -->
<template>
    <div class="modal fade" :id="modalId" tabindex="-1" aria-labelledby="createObjectModalLabel" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="createObjectModalLabel">Create {{ type }}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" @click="closeModal"></button>
                </div>
                <div class="modal-body">
                    <form @submit.prevent="submitForm">
                        <div class="mb-3">
                            <label for="name" class="form-label">Name</label>
                            <input type="text" class="form-control" id="name" v-model="formData.name" required>
                        </div>
                        <div class="mb-3">
                            <label for="description" class="form-label">Description</label>
                            <textarea class="form-control" id="description" v-model="formData.description"></textarea>
                        </div>
                        <!-- Add more fields as needed, specific to type if required -->
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" @click="closeModal">Close</button>
                            <button type="submit" class="btn btn-primary">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue';
import axios from 'axios';
import { Modal } from 'bootstrap';

export default {
    name: 'CreateObjectModal',
    props: {
        type: {
            type: String,
            required: true
        }
    },
    emits: ['close', 'object-created'],
    setup(props, { emit }) {
        const formData = ref({
            name: '',
            description: '',
            type: props.type // Pass type to backend
        });
        const modalId = 'createObjectModal';
        let modalInstance = null;

        // Initialize Bootstrap modal on mount
        onMounted(() => {
            const modalElement = document.getElementById(modalId);
            modalInstance = new Modal(modalElement);
            modalInstance.show();

            // Listen for modal hidden event to emit close
            modalElement.addEventListener('hidden.bs.modal', () => {
                emit('close');
            });
        });

        // Clean up event listener
        onUnmounted(() => {
            const modalElement = document.getElementById(modalId);
            if (modalElement) {
                modalElement.removeEventListener('hidden.bs.modal', () => {});
            }
        });

        const closeModal = () => {
            if (modalInstance) {
                modalInstance.hide();
            }
        };

        const submitForm = async () => {
            try {
                const response = await axios.post('/api/v1/object/create', formData.value); // Adjust endpoint as needed
                emit('object-created', response.data);
                closeModal();
            } catch (error) {
                console.error('Error creating object:', error);
                alert('Failed to create object: ' + (error.response?.data?.message || error.message));
            }
        };

        return {
            formData,
            modalId,
            closeModal,
            submitForm
        };
    }
};
</script>

<style scoped>
/* Optional: Customize modal styles if needed */
</style>
