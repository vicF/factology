<template>
    <div class="tree-menu">
        <div
            class="tree-node"
            :style="indent"
            @mouseenter.stop="showIcons = true"
            @mouseleave.stop="showIcons = false"
        >
            <span class="toggle" @click="toggleChildren">
                {{ showToggle ? (showChildren ? '−' : '+') : ' ' }}
            </span>
            <input type="checkbox" :value="id" :checked="isChecked" @change="onCheckboxChange" />
            <span class="node-name">{{ name }}</span>
            <span class="action-icons" :class="{ 'visible': showIcons }">
                <span class="add-subclass" @click="openCreateSubclassModal">+</span>
                <span class="add-object" @click="openCreateObjectModal">📦</span>
            </span>
        </div>
        <div class="children" v-if="showChildren">
            <tree-menu
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
    </div>
</template>

<script>
import { useCheckboxStore } from '../stores/checkboxes';
import { computed, ref } from 'vue';
import { eventBus } from '../eventBus';

export default {
    props: ['id', 'name', 'nodes', 'depth'],
    name: 'tree-menu',
    data() {
        return {
            showChildren: true,
            checkedItems: [],
        };
    },
    setup(props, { emit }) {
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
            eventBus.emit('open-create-modal', `Subclass of ${props.name}`, { parentId: props.id });
        };

        const openCreateObjectModal = () => {
            eventBus.emit('open-create-modal', props.name, { classId: props.id });
        };

        return { isChecked, onCheckboxChange, showIcons, openCreateSubclassModal, openCreateObjectModal };
    },
    computed: {
        showToggle() {
            return this.nodes && this.nodes.length > 0;
        },
        indent() {
            return { marginLeft: `${this.depth * 15}px` }; // Reduced indent, applied to node
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
    margin-left: 0; /* No extra left margin on the container */
}

.tree-node {
    display: flex;
    align-items: center;
    padding: 2px 0;
}

.toggle {
    display: inline-block;
    width: 16px; /* Slightly smaller to reduce space */
    text-align: center;
    font-size: larger;
    cursor: pointer;
    user-select: none;
}

input[type="checkbox"] {
    margin: 0 6px 0 0; /* Reduced spacing */
    flex-shrink: 0;
}

.node-name {
    /* Removed nowrap and truncation to allow wrapping */
    margin-right: 5px; /* Space before icons */
}

.action-icons {
    display: inline-flex;
    align-items: center;
    visibility: hidden;
}

.action-icons.visible {
    visibility: visible;
}

.add-subclass, .add-object {
    cursor: pointer;
    font-size: larger;
    margin-left: 5px;
}

.add-subclass:hover, .add-object:hover {
    color: #007bff;
}

.children {
    /* No extra padding/margin; indent comes from .tree-node */
}
</style>
