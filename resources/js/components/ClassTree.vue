<template>
    Classes:
    <tree-menu
        :name="classes.name"
        :nodes="classes.nodes"
        :depth="0">
    </tree-menu>
</template>

<script>
import TreeMenu from "./TreeMenu.vue";
import { useObjectsStore } from '@/stores/objects';

export default {
    name: "ClassTree",
    components: { TreeMenu },
    data() {
        return {
            classes: [],
            loaded: false,
        };
    },
    created() {
        this.getClasses();
    },
    methods: {
        async getClasses() {
            const objectsStore = useObjectsStore();
            await objectsStore.loadClassTree();
            this.classes = objectsStore.classes;
            this.loaded = true;
        }
    }
}
</script>

<style scoped>
</style>
