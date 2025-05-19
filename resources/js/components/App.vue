<!-- factology/resources/js/components/App.vue -->
<template>
    <div id="app">
        <!-- Render page content -->
        <router-view></router-view>
        <!-- Global EditObject modal -->
        <EditObject
            v-if="showModal"
            :object="null"
            :params="modalParams"
            @object-created="handleObjectCreated"
            @object-updated="handleObjectUpdated"
            @close="showModal = false"
        />
    </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import EditObject from './EditObject.vue';
import { eventBus } from '../eventBus';

export default {
    name: 'App',
    components: { EditObject },
    setup() {
        const router = useRouter();
        const showModal = ref(false);
        const modalParams = ref({});

        const handleObjectCreated = (newObject) => {
            console.log('App.vue - Object created:', newObject);
            showModal.value = false;
            router.push({ name: 'object', params: { uid: newObject.data.thing_id } });
        };

        const handleObjectUpdated = (updatedObject) => {
            console.log('App.vue - Object updated:', updatedObject);
            showModal.value = false;
        };

        const handleOpenCreateModal = ({ title, params }) => {
            console.log('App.vue - Received open-create-modal:', { title, params });
            modalParams.value = params;
            showModal.value = true;
        };

        onMounted(() => {
            eventBus.on('open-create-modal', handleOpenCreateModal);
        });

        onUnmounted(() => {
            eventBus.off('open-create-modal', handleOpenCreateModal);
        });

        return {
            showModal,
            modalParams,
            handleObjectCreated,
            handleObjectUpdated,
        };
    },
};
</script>
