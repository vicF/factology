<template>
    <div>
        Classes:
        <div v-if="loading && (!rootNodes || rootNodes.length === 0)" class="tree-loader">
            <div class="loader-item" v-for="n in 5" :key="n">
                <span class="loader-toggle"></span>
                <span class="loader-checkbox"></span>
                <span class="loader-text" :style="{ width: (60 + Math.random() * 30) + '%' }"></span>
            </div>
        </div>
        <div v-else-if="rootNodes && rootNodes.length">
            <template v-for="root in rootNodes" :key="root.id">
                <!-- If this is the "Anything" node, render its children directly -->
                <template v-if="root.id === '939cd822-9e23-450c-8c5e-c23f67cca792' || root.name === 'Everything'">
                    <TreeMenu
                        v-for="child in root.nodes"
                        :key="child.id"
                        :id="child.id"
                        :name="child.name"
                        :translations="child.name_translations"
                        :nodes="child.nodes || []"
                        :depth="0"
                        :public="child.public"
                        :type="child.type"
                    />
                </template>
                <!-- Otherwise render the node normally -->
                <TreeMenu
                    v-else
                    :id="root.id"
                    :name="root.name"
                    :translations="root.name_translations"
                    :nodes="root.nodes || []"
                    :depth="0"
                    :public="root.public"
                    :type="root.type"
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
const loading = computed(() => objectsStore.loading);

onMounted(() => {
    objectsStore.loadClassTree();
});
</script>

<style scoped>
.tree-loader {
    padding: 8px 0;
}
.loader-item {
    display: flex;
    align-items: center;
    padding: 6px 0;
    gap: 6px;
}
.loader-toggle {
    display: inline-block;
    width: 16px;
    height: 16px;
    background: #e0e0e0;
    border-radius: 3px;
    flex-shrink: 0;
}
.loader-checkbox {
    display: inline-block;
    width: 16px;
    height: 16px;
    background: #e0e0e0;
    border-radius: 3px;
    flex-shrink: 0;
}
.loader-text {
    display: inline-block;
    height: 14px;
    background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
    background-size: 200% 100%;
    border-radius: 4px;
    animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}
</style>
