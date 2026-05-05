<template>
    <div id="app">
        <router-view></router-view>
        <EditObject
            v-if="showModal"
            :object="null"
            :params="modalParams"
            :title="modalTitle"
            :initialLinkedObjects="modalInitialLinkedObjects"
            :callback="modalCallback"
            @object-created="handleObjectCreated"
            @object-updated="handleObjectUpdated"
            @close="showModal = false"
        />
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import EditObject from './EditObject.vue';
import { eventBus } from '../eventBus';

// Note: Icons are globally registered, no need to import them here

const router = useRouter();
const showModal = ref(false);
const modalParams = ref({});
const modalTitle = ref('');
const modalInitialLinkedObjects = ref([]);
const modalCallback = ref(null);

const handleObjectCreated = (newObject) => {
    console.log('App.vue - Object created:', newObject);
    showModal.value = false;
    modalTitle.value = '';
    if (newObject?.data?.thing_id) {
        router.push({ name: 'object', params: { uid: newObject.data.thing_id } });
    } else if (newObject?.thing_id) {
        router.push({ name: 'object', params: { uid: newObject.thing_id } });
    }
};

const handleObjectUpdated = (updatedObject) => {
    console.log('App.vue - Object updated:', updatedObject);
    showModal.value = false;
    modalTitle.value = '';
};

const handleOpenCreateModal = (...args) => {
    console.log('App.vue - Raw open-create-modal args:', args);
    const eventData = args[0] || {};
    const { title = 'Untitled', params = {}, initialLinkedObjects = [], callback = null } = eventData;
    console.log('App.vue - Parsed open-create-modal:', { title, params, initialLinkedObjects, callback });

    modalParams.value = params;
    modalTitle.value = title;
    modalInitialLinkedObjects.value = initialLinkedObjects;
    modalCallback.value = callback;
    showModal.value = true;
};

onMounted(() => {
    console.log('App.vue - Mounting, registering eventBus listener');
    eventBus.on('open-create-modal', handleOpenCreateModal);
});

onUnmounted(() => {
    eventBus.off('open-create-modal', handleOpenCreateModal);
});
</script>

<style>
/* Global styles for icons - you can add size utilities */
.icon-xs { width: 12px; height: 12px; }
.icon-sm { width: 14px; height: 14px; }
.icon-md { width: 16px; height: 16px; }
.icon-lg { width: 20px; height: 20px; }
.icon-xl { width: 24px; height: 24px; }

/* Example of how to use with different colors */
.icon-primary { color: #0d6efd; }
.icon-success { color: #198754; }
.icon-danger { color: #dc3545; }
.icon-warning { color: #ffc107; }
.icon-light { color: #f8f9fa; }
.icon-dark { color: #212529; }
</style>
