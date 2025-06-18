<template>
    <div id="app">
        <router-view></router-view>
        <EditObject
            v-if="showModal"
            :object="null"
            :params="modalParams"
            :title="modalTitle"
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
        const modalTitle = ref('');

        const handleObjectCreated = (newObject) => {
            console.log('App.vue - Object created:', newObject);
            showModal.value = false;
            modalTitle.value = '';
            router.push({ name: 'object', params: { uid: newObject.data.thing_id } });
        };

        const handleObjectUpdated = (updatedObject) => {
            console.log('App.vue - Object updated:', updatedObject);
            showModal.value = false;
            modalTitle.value = '';
        };

        const handleOpenCreateModal = (...args) => {
            console.log('App.vue - Raw open-create-modal args:', args);
            const eventData = args[0] || {};
            const { title = 'Untitled', params = {} } = eventData;
            console.log('App.vue - Parsed open-create-modal:', { title, params });
            if (!params.parentId && !params.classId) {
                console.warn('App.vue - Warning: params is missing parentId or classId', params);
            }
            modalParams.value = params;
            modalTitle.value = title;
            showModal.value = true;
        };

        onMounted(() => {
            console.log('App.vue - Mounting, registering eventBus listener');
            eventBus.on('open-create-modal', handleOpenCreateModal);
        });

        onUnmounted(() => {
            eventBus.off('open-create-modal', handleOpenCreateModal);
        });

        return {
            showModal,
            modalParams,
            modalTitle,
            handleObjectCreated,
            handleObjectUpdated,
        };
    },
};
</script>
