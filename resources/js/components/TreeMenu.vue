<template>
    <div class="tree-menu">
        <div :style="indent" @click="toggleChildren">{{showChildren?'-':'+'}}{{ label }}</div>
        <tree-menu
            v-if="showChildren"
            v-for="node in nodes"
            :nodes="node.nodes"
            :label="node.label"
            :depth="depth + 1"
        >
        </tree-menu>
    </div>
</template>
<script>
export default {
    props: ['label', 'nodes', 'depth'],
    name: 'tree-menu',
    data() {
        return { showChildren: false }
    },
    computed: {
        indent() {
            return {transform: `translate(${this.depth * 10}px)`}
        }
    },
    methods: {
        toggleChildren() {
            this.showChildren = !this.showChildren;
        }
    }
}
</script>

<style scoped>

</style>
