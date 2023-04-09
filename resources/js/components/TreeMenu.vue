<template>
    <div class="tree-menu">
        <div :style="indent" @click="toggleChildren">{{showChildren?'-':'+'}}{{ name }}</div>
        <tree-menu
            v-if="showChildren"
            v-for="node in nodes"
            :nodes="node.nodes"
            :name="node.name"
            :depth="depth + 1"
        >
        </tree-menu>
    </div>
</template>
<script>
export default {
    props: ['name', 'nodes', 'depth'],
    name: 'tree-menu',
    data() {
        return { showChildren: true }
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
