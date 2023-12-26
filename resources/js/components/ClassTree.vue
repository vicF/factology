<template>
    Classes:
    <tree-menu
        :name="this.classes.name"
        :nodes="this.classes.nodes"
        :depth="0"></tree-menu>
</template>

<script>
import TreeMenu from "./TreeMenu.vue";
import { useObjectsStore } from '@/stores/objects';
const objects = useObjectsStore()

export default {
    name: "ClassTree",
    components: {TreeMenu},
    data() {
        return {
            classes: [],
            checkedItems: [],
        }
    },
    created: function () {
        this.getClasses();
    },
    methods: {
        async getClasses() {
            await objects.loadClassTree();
            this.classes = objects.classes;
        }
    }
}
</script>

<style scoped>

</style>
