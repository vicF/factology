<template>
    <div class="tree-menu">
        <div :style="indent"><span v-if="showToggle" @click="toggleChildren" style="font-size: larger">
                {{ showChildren ? '- ' : '+ ' }}
            </span>
            <input type="checkbox" name="class"  :value="id" /> {{ name }}</div>
        <tree-menu
            v-if="showChildren"
            v-for="node in nodes"
            :id="node.id"
            :nodes="node.nodes"
            :name="node.name"
            :depth="depth + 1"
        >
        </tree-menu>
    </div>
</template>
<script>
export default {
    props: ['id', 'name', 'nodes', 'depth'],
    name: 'tree-menu',
    data() {
        return { showChildren: true }
    },
    computed: {
        showToggle() {
            return this.nodes && this.nodes.length > 0;
        },
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
