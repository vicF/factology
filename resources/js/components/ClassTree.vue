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

const objectsStore = useObjectsStore();

// Use computed to react to store changes automatically
const classes = computed(() => objectsStore.classes);

onMounted(() => {
    objectsStore.loadClassTree();
});
</script>
