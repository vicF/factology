<template>
    <div>
        Classes:
        <TreeMenu :id="classes.id" :name="classes.name" :nodes="classes.nodes" :depth="0" />
    </div>
</template>

<script>
import TreeMenu from "./TreeMenu.vue";
import { useObjectsStore } from '@/stores/objects';
import { ref, onMounted } from 'vue';

export default {
    components: { TreeMenu },
    setup() {
        const classes = ref([]);
        const loaded = ref(false);

        const getClasses = async () => {
            const objectsStore = useObjectsStore();
            await objectsStore.loadClassTree();
            classes.value = objectsStore.classes;
            loaded.value = true;
        };

        onMounted(() => {
            getClasses();
        });

        const openCreateSubclassModal = () => {
            eventBus.emit('open-create-modal', {
                title: `Subclass of ${props.name}`,
                params: {parentId: props.id, type: 2}
            });
        };

        const openCreateObjectModal = () => {
            console.log('ClassTree.vue - Emitting open-create-modal for object:', {
                title: `Object of ${props.name}`,
                params: {classId: props.id, type: 3}
            });
            eventBus.emit('open-create-modal', {
                title: `Object of ${props.name}`,
                params: {classId: props.id, className:props.name, type: 3} // Type 3 for objects
            });
        };

        return {classes, loaded, openCreateSubclassModal, openCreateObjectModal};
    },
};
</script>

<style scoped>
</style>
