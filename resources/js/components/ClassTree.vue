<template>
    <div>
        Classes:
        <TreeMenu
            v-if="classes && classes.id"
            :id="classes.id"
            :name="classes.name || 'Root Classes'"
            :nodes="classes.nodes || []"
            :depth="0"
        />
        <div v-else class="text-muted p-3">
            No classes available
        </div>
    </div>
</template>

<script setup>
import TreeMenu from "./TreeMenu.vue";
import { useObjectsStore } from '@/stores/objects';
import { ref, onMounted, computed } from 'vue';
import { eventBus } from '../eventBus';

const objectsStore = useObjectsStore();

const classes = ref({
    id: null,
    name: '',
    nodes: []
});
const loaded = ref(false);

const getClasses = async () => {
    await objectsStore.loadClassTree();
    // Ensure we have valid structure even if empty
    classes.value = objectsStore.classes || {
        id: null,
        name: '',
        nodes: []
    };
    loaded.value = true;
};

onMounted(() => {
    getClasses();
});

// Only define these if they're actually used
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
