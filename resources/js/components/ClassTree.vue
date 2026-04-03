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
import { computed, onMounted } from 'vue';
import { eventBus } from '../eventBus';

const objectsStore = useObjectsStore();

// Use computed to react to store changes automatically
const classes = computed(() => objectsStore.classes);

onMounted(() => {
    objectsStore.loadClassTree();
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
    eventBus.emit('open-create-modal', {
        title: `Object of ${classes.value.name}`,
        params: {classId: classes.value.id, className: classes.value.name, type: 3}
    });
};
</script>
