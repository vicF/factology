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
            <div class="node-content">
                <span class="node-name">{{ name }}</span>
                <span class="action-icons" :class="{ 'visible': showIcons }">
                    <span class="add-subclass" @click="openCreateSubclassModal">+</span>
                    <span class="add-object" @click="openCreateObjectModal">📦</span>
                </span>
            </div>
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
            return { marginLeft: `${this.depth * 15}px` };
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
    margin-left: 0;
}

.tree-node {
    display: flex;
    align-items: flex-start; /* Align to top for multi-line consistency */
    padding: 2px 0;
}

.toggle {
    display: inline-block;
    width: 16px;
    text-align: center;
    font-size: larger;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0; /* Prevent shrinking */
}

input[type="checkbox"] {
    margin: 2px 6px 0 0; /* Align checkbox with first line */
    flex-shrink: 0;
}

.node-content {
    display: flex;
    align-items: flex-start; /* Ensure name and icons align with first line */
    flex-grow: 1; /* Take up remaining space */
}

.node-name {
    margin-right: 5px;
    word-wrap: break-word; /* Allow wrapping */
}

.action-icons {
    display: inline-flex;
    align-items: center;
    visibility: hidden;
    flex-shrink: 0; /* Prevent icons from shrinking */
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
