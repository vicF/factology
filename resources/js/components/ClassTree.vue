<template>
    Classes:
    <tree-menu
        :name="this.classes.name"
        :nodes="this.classes.nodes"
        :depth="0"
        :checked-items="checkboxStore.checkedItems">
        </tree-menu>
</template>

<script>
import TreeMenu from "./TreeMenu.vue";
import { useObjectsStore } from '@/stores/objects';
import { useCheckboxStore } from '../stores/checkboxes';
const objects = useObjectsStore()
const checkboxStore = useCheckboxStore();

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
        },
        handleCheckedUpdate(updatedCheckedItems) {
            this.checkedItems = updatedCheckedItems;
        }
    }
}
</script>

<style scoped>

</style>
