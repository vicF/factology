<template>
    <div>
        Classes:
        <div v-if="rootNodes && rootNodes.length">
            <template v-for="root in rootNodes" :key="root.id">
                <!-- If this is the "Anything" node, render its children directly -->
                <template v-if="root.id === '939cd822-9e23-450c-8c5e-c23f67cca792' || root.name === 'Anything'">
                    <TreeMenu
                        v-for="child in root.nodes"
                        :key="child.id"
                        :id="child.id"
                        :name="child.name"
                        :nodes="child.nodes || []"
                        :depth="0"
                    />
                </template>
                <!-- Otherwise render the node normally -->
                <TreeMenu
                    v-else
                    :id="root.id"
                    :name="root.name"
                    :nodes="root.nodes || []"
                    :depth="0"
                />
            </template>
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
