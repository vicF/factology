<template>
    <div id="app">
        <router-view></router-view>
        <!-- Stacked create modals: the link-row "Create" button opens a new modal
             on top of the currently open one (e.g. creating an author while
             creating a book). Only the top modal is visible; the ones below stay
             mounted so their form state survives. -->
        <EditObject
            v-for="(modal, idx) in modalStack"
            :key="modal.requestKey"
            :object="null"
            :params="modal.params"
            :title="modal.title"
            :initialLinkedObjects="modal.initialLinkedObjects"
            :callback="modal.callback"
            :active="idx === modalStack.length - 1"
            @object-created="(o) => handleObjectCreated(o, modal.requestKey)"
            @object-updated="() => handleObjectUpdated(modal.requestKey)"
            @close="() => closeModal(modal.requestKey)"
        />
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import EditObject from './EditObject.vue';
import { eventBus } from '@factology/engine/eventBus.js';

// Note: Icons are globally registered, no need to import them here

const router = useRouter();
const modalStack = ref([]);

const removeModal = (key) => {
    modalStack.value = modalStack.value.filter(m => m.requestKey !== key);
};

const handleObjectCreated = (newObject, key) => {
    console.log('App.vue - Object created:', newObject);
    const closed = modalStack.value.find(m => m.requestKey === key);
    removeModal(key);
    // A link-created modal filled a link slot in the modal below it — keep the
    // parent modal open instead of navigating away to the created object.
    if (closed?.callback?.type === 'link-created') return;
    const id = newObject?.data?.thing_id || newObject?.thing_id;
    if (id) {
        router.push({ name: 'object', params: { uid: id } });
    }
};

const handleObjectUpdated = (key) => {
    console.log('App.vue - Object updated:', key);
    removeModal(key);
};

const closeModal = (key) => {
    removeModal(key);
};

const handleOpenCreateModal = (...args) => {
    console.log('App.vue - Raw open-create-modal args:', args);
    const eventData = args[0] || {};
    const { title = 'Untitled', params = {}, initialLinkedObjects = [], callback = null } = eventData;
    console.log('App.vue - Parsed open-create-modal:', { title, params, initialLinkedObjects, callback });

    modalStack.value.push({
        requestKey: `modal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title,
        params,
        initialLinkedObjects,
        callback,
    });
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
