<template>
    <div class="tree-menu">
        <div
            :id="id"
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
            // Emit a new event to trigger search with selected class IDs
            eventBus.emit('trigger-search', store.checkedItems);
        }

        const openCreateSubclassModal = () => {
            console.log('TreeMenu.vue - openCreateSubclassModal triggered');
            console.log('TreeMenu.vue - Props:', { id: props.id, name: props.name });
            if (!props.id) {
                console.warn('TreeMenu.vue - Warning: props.id is undefined for subclass creation');
            }
            const payload = {
                title: `Subclass of ${props.name || 'Unnamed'}`,
                params: { parentId: props.id, type: 2 }
            };
            console.log('TreeMenu.vue - Emitting open-create-modal for subclass:', payload);
            eventBus.emit('open-create-modal', payload);
        };

        const openCreateObjectModal = () => {
            console.log('TreeMenu.vue - openCreateObjectModal triggered');
             console.log('TreeMenu.vue - Props:', { id: props.id, name: props.name });
            if (!props.id) {
                console.warn('TreeMenu.vue - Warning: props.id is undefined for object creation');
            }
            const payload = {
                title: `Object of ${props.name || 'Unnamed'}`,
                params: { classId: props.id, type: 3 }
            };
            console.log('TreeMenu.vue - Emitting open-create-modal for object:', payload);
            eventBus.emit('open-create-modal', payload);
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
    padding-left: 0; /* Ensure no internal padding */
}

.tree-node {
    display: flex;
    align-items: center;
    padding: 1px 0;
}

.toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    font-size: larger;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;
}

input[type="checkbox"] {
    margin: 0 6px 0 0;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
}

.node-content {
    display: flex;
    align-items: center;
    flex-grow: 1;
}

.node-name {
    margin-right: 5px;
    word-wrap: break-word;
    line-height: 1.1;
}

.action-icons {
    display: inline-flex;
    align-items: center;
    visibility: hidden;
    flex-shrink: 0;
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
    padding-left: 0; /* No extra padding for children */
}
</style>
