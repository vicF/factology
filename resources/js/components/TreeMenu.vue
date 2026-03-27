<!-- One element of class tree -->
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
                <span class="node-name"><router-link class="dropdown-item" :to="`/object/${id}`">{{ name }}</router-link></span>
                <span class="action-icons" :class="{ 'visible': showIcons }">
                    <span class="add-subclass" @click="openCreateSubclassModal" :title="`Add child class below &quot;${name}&quot;`">+</span>
                    <span class="add-object" @click="openCreateObjectModal" :title="`Create object of class &quot;${name}&quot;`">📦</span>
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

<script setup>
import { ref, computed } from 'vue';
import { useSearchStore } from '../stores/search';
import { eventBus } from '../eventBus';

// Props definition
const props = defineProps({
    id: {
        type: [String, Number],
        required: true
    },
    name: {
        type: String,
        required: true
    },
    nodes: {
        type: Array,
        default: () => []
    },
    depth: {
        type: Number,
        default: 0
    },
    checkedItems: {
        type: Array,
        default: () => []
    }
});

// Emits definition
const emit = defineEmits(['update-checked']);

// Component name
defineOptions({
    name: 'tree-menu'
});

// Store
const store = useSearchStore();

// State
const showChildren = ref(true);
const showIcons = ref(false);

// Computed
const isChecked = computed(() => {
    return store.checkedItems.includes(props.id);
});

const showToggle = computed(() => {
    return props.nodes && props.nodes.length > 0;
});

const indent = computed(() => {
    return { marginLeft: `${props.depth * 15}px` };
});

// Methods
const toggleChildren = () => {
    showChildren.value = !showChildren.value;
};

const onCheckboxChange = () => {
    store.toggleItem(props.id);
    emit('update-checked', store.checkedItems);
    eventBus.emit('trigger-search');
};

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
        params: { classId: props.id, className: props.name, type: 3 }
    };
    console.log('TreeMenu.vue - Emitting open-create-modal for object:', payload);
    eventBus.emit('open-create-modal', payload);
};

const handleCheckedUpdate = (checkedItems) => {
    // This is just passing through the event from child components
    emit('update-checked', checkedItems);
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
