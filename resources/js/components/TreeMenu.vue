<template>
    <div class="tree-menu">
        <div
            class="tree-node"
            @mouseenter.stop="showIcons = true"
            @mouseleave.stop="showIcons = false"
        >
            <span v-if="showToggle" @click="toggleChildren" style="font-size: larger; cursor: pointer;">
                {{ showChildren ? '- ' : '+ ' }}
            </span>
            <span v-else style="font-size: larger">
                &nbsp;&nbsp;
            </span>
            &nbsp;<input type="checkbox" :value="id" :checked="isChecked" @change="onCheckboxChange" />
            &nbsp;{{ name }}
            <span class="action-icons" :class="{ 'visible': showIcons }">
                <span class="add-subclass" @click="openCreateSubclassModal">+</span>
                <span class="add-object" @click="openCreateObjectModal">📦</span>
            </span>
        </div>
        <tree-menu
            v-if="showChildren"
            v-for="node in nodes"
            :key="node.id"
            :id="node.id"
            :nodes="node.nodes"
            :name="node.name"
            :depth="depth + 1"
            :checked-items="checkedItems"
            @update-checked="handleCheckedUpdate"
        ></tree-menu>
    </div>
</template>

<script>
import {useCheckboxStore} from '../stores/checkboxes';
import {computed, ref} from 'vue';
import {eventBus} from '../eventBus';

export default {
    props: ['id', 'name', 'nodes', 'depth'],
    name: 'tree-menu',
    data() {
        return {
            showChildren: true,
            checkedItems: [],
        };
    },
    setup(props, {emit}) {
        const store = useCheckboxStore();
        const showIcons = ref(false);

        const isChecked = computed(() => {
            return store.checkedItems.includes(props.id);
        });

        function onCheckboxChange() {
            store.toggleItem(props.id);
            emit('update-checked', store.checkedItems);
        }

        const openCreateSubclassModal = () => {
            eventBus.emit('open-create-modal', `Subclass of ${props.name}`, {parentId: props.id});
        };

        const openCreateObjectModal = () => {
            eventBus.emit('open-create-modal', props.name, {classId: props.id});
        };

        return {isChecked, onCheckboxChange, showIcons, openCreateSubclassModal, openCreateObjectModal};
    },
    computed: {
        showToggle() {
            return this.nodes && this.nodes.length > 0;
        },
        indent() {
            return {transform: `translate(${this.depth * 10}px)`};
        }
    },
    methods: {
        toggleChildren() {
            this.showChildren = !this.showChildren;
        },
        handleCheckedUpdate(checkedItems) {
            this.checkedItems = checkedItems;
        }
    }
};
</script>

<style scoped>
.tree-menu {
    position: relative;
}

.tree-node {
    display: flex;
    align-items: center;
    white-space: nowrap; /* Prevent text wrapping */
}

.action-icons {
    margin-left: 5px;
    display: inline-flex; /* Keep icons inline and reserve space */
    width: 40px; /* Fixed width to reserve space (adjust as needed) */
    visibility: hidden; /* Hidden but still takes up space */
}

.action-icons.visible {
    visibility: visible; /* Show when hovered */
}

.add-subclass, .add-object {
    cursor: pointer;
    font-size: larger;
    margin-left: 5px;
}

.add-subclass:hover, .add-object:hover {
    color: #007bff;
}
</style>
