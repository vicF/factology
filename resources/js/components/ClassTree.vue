<template>
    <div>
        Classes:
        <TreeMenu
            v-if="classes && classes.id && !isRefreshing"
            :id="classes.id"
            :name="classes.name || 'Root Classes'"
            :nodes="classes.nodes || []"
            :depth="0"
            :key="treeKey"
        />
        <div v-else-if="!isRefreshing" class="text-muted p-3">
            No classes available
        </div>
        <div v-else class="text-muted p-3">
            Loading...
        </div>
    </div>
</template>

<script setup>
import TreeMenu from "./TreeMenu.vue";
import { useObjectsStore } from '@/stores/objects';
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { eventBus } from '../eventBus';

const objectsStore = useObjectsStore();

const classes = ref({
    id: null,
    name: '',
    nodes: []
});
const loaded = ref(false);
const isRefreshing = ref(false);
const treeKey = ref(0);

const getClasses = async () => {
    try {
        isRefreshing.value = true;
        await objectsStore.loadClassTree();
        classes.value = objectsStore.classes || {
            id: null,
            name: '',
            nodes: []
        };
        loaded.value = true;
        treeKey.value++;
    } catch (error) {
        console.error('Error loading classes:', error);
    } finally {
        await nextTick();
        isRefreshing.value = false;
    }
};

// Handle class created event
const handleClassCreated = async (classData) => {
    console.log('Class created, refreshing tree...', classData);
    // Small delay to ensure modal is completely closed
    setTimeout(async () => {
        await getClasses();
    }, 100);
};

// Handle class updated event
const handleClassUpdated = async (classData) => {
    console.log('Class updated, refreshing tree...', classData);
    // Small delay to ensure modal is completely closed
    setTimeout(async () => {
        await getClasses();
    }, 100);
};

onMounted(() => {
    getClasses();

    // Listen for class-related events
    eventBus.on('class-created', handleClassCreated);
    eventBus.on('class-updated', handleClassUpdated);
});

onUnmounted(() => {
    // Clean up event listeners
    eventBus.off('class-created', handleClassCreated);
    eventBus.off('class-updated', handleClassUpdated);
});

const openCreateSubclassModal = () => {
    if (!classes.value?.id) {
        console.warn('ClassTree.vue - No class selected for subclass creation');
        return;
    }
    eventBus.emit('open-create-modal', {
        title: `Subclass of ${classes.value.name}`,
        params: { parentId: classes.value.id, type: 2 }
    });
};

const openCreateObjectModal = () => {
    if (!classes.value?.id) {
        console.warn('ClassTree.vue - No class selected for object creation');
        return;
    }
    console.log('ClassTree.vue - Emitting open-create-modal for object:', {
        title: `Object of ${classes.value.name}`,
        params: { classId: classes.value.id, type: 3 }
    });
    eventBus.emit('open-create-modal', {
        title: `Object of ${classes.value.name}`,
        params: { classId: classes.value.id, className: classes.value.name, type: 3 }
    });
};
</script>
