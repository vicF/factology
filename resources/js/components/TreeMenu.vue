<template>
    <div class="tree-menu">
        <div :style="indent"><span v-if="showToggle" @click="toggleChildren" style="font-size: larger">
                {{ showChildren ? '- ' : '+ ' }}
            </span>
            <input type="checkbox" name="class"  :value="id" v-model="checkedItems" /> {{ name }}</div>
        <tree-menu
            v-if="showChildren"
            v-for="node in nodes"
            :id="node.id"
            :nodes="node.nodes"
            :name="node.name"
            :depth="depth + 1"
            :checked-items="checkedItems"
            @update-checked="handleCheckedUpdate"
        >
        </tree-menu>
    </div>
</template>
<script>
import { useCheckboxStore } from '../stores/checkboxes';
import { computed } from 'vue';
export default {
    props: ['id', 'name', 'nodes', 'depth'],
    name: 'tree-menu',
    data() {
        return { showChildren: true }
    },
    setup(props, { emit }) {
        const store = useCheckboxStore();

        const isChecked = computed(() => store.checkedItems.includes(props.id));

        function onCheckboxChange() {
            store.toggleItem(props.id);
            emit('update-checked', store.checkedItems);
        }

        return { isChecked, onCheckboxChange };
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
        },
        onCheckboxChange() {
        // Logic to update checked items
            this.$emit('update-checked', this.checkedItems);
        }
    }
}
</script>

<style scoped>

</style>
