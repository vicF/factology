<template>
    <div>
        Classes:
        <TreeMenu :name="classes.name" :nodes="classes.nodes" :depth="0" />
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

        return {
            classes,
            loaded,
        };
    },
};
</script>

<style scoped>
</style>
