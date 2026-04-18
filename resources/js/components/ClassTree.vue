<template>
    <div>
        Classes:
        <div v-if="rootNodes && rootNodes.length">
            <TreeMenu
                v-for="root in rootNodes"
                :key="root.id"
                :id="root.id"
                :name="root.name"
                :nodes="root.nodes || []"
                :depth="0"
            />
        </div>
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

// Use rootNodes from the store (array of top-level nodes)
const rootNodes = computed(() => objectsStore.rootNodes);

onMounted(() => {
    objectsStore.loadClassTree();
});
</script>
