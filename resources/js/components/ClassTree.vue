<template>
    <div>
        Classes:
        <TreeMenu :id="classes.id" :name="classes.name" :nodes="classes.nodes" :depth="0" />
    </div>
</template>

<script setup>
import TreeMenu from "./TreeMenu.vue";
import { useObjectsStore } from '@/stores/objects';
import { ref, onMounted } from 'vue';
import { eventBus } from '../eventBus'; // Added import - make sure path is correct

const classes = ref([]);
const loaded = ref(false);
const objectsStore = useObjectsStore();

const getClasses = async () => {
    await objectsStore.loadClassTree();
    classes.value = objectsStore.classes;
    loaded.value = true;
};

onMounted(() => {
    getClasses();
});

// Note: props would need to be defined if this component receives props
// For now, these functions reference 'props' which isn't defined in the original
// You'll need to define props if this component receives them
const openCreateSubclassModal = () => {
    eventBus.emit('open-create-modal', {
        title: `Subclass of ${props.name}`,
        params: { parentId: props.id, type: 2 }
    });
};

const openCreateObjectModal = () => {
    console.log('ClassTree.vue - Emitting open-create-modal for object:', {
        title: `Object of ${props.name}`,
        params: { classId: props.id, type: 3 }
    });
    eventBus.emit('open-create-modal', {
        title: `Object of ${props.name}`,
        params: { classId: props.id, className: props.name, type: 3 } // Type 3 for objects
    });
};
</script>

<style scoped>
</style>
