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
import {LINK_TO_CLASS, THING_TYPE, CLASS_TYPE, LINK_TO_PARENT} from '../constants.js';

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

// Create a subclass (Class type)
const openCreateSubclassModal = () => {
    console.log('TreeMenu.vue - Creating subclass of:', props.name);

    // Create initial linked objects for the new class
    const initialLinkedObjects = [];

    // Link to parent class
    if (props.id) {
        initialLinkedObjects.push({
            other_thing_id: props.id,
            link_type_id: LINK_TO_PARENT, // Use the constant from constants.js
            description: `Subclass of ${props.name}`,
        });
    }

    const payload = {
        title: `Create Subclass of "${props.name}"`,
        params: {
            type: CLASS_TYPE, // 2 - Class type
        },
        initialLinkedObjects: initialLinkedObjects,
        callback: {
            type: 'class-created',
            parentId: props.id,
            parentName: props.name
        }
    };

    console.log('TreeMenu.vue - Emitting open-create-modal for subclass:', payload);
    eventBus.emit('open-create-modal', payload);
};

// Create an object of this class (Thing type)
const openCreateObjectModal = () => {
    console.log('TreeMenu.vue - Creating object of class:', props.name);

    // Create initial linked objects for the new object
    const initialLinkedObjects = [];

    // Link to the class
    if (props.id) {
        initialLinkedObjects.push({
            other_thing_id: props.id,
            link_type_id: LINK_TO_CLASS, // Link to class relationship
            description: `Object of class ${props.name}`,
        });
    }

    const payload = {
        title: `Create Object of Class "${props.name}"`,
        params: {
            type: THING_TYPE, // 3 - Thing type
            classId: props.id,
            className: props.name,
        },
        initialLinkedObjects: initialLinkedObjects,
        callback: {
            type: 'object-created',
            classId: props.id,
            className: props.name
        }
    };

    console.log('TreeMenu.vue - Emitting open-create-modal for object:', payload);
    eventBus.emit('open-create-modal', payload);
};

// Handle checked update from child components
const handleCheckedUpdate = (checkedItems) => {
    emit('update-checked', checkedItems);
};
</script>

<style scoped>
.tree-menu {
    position: relative;
    margin-left: 0;
    padding-left: 0;
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
    padding-left: 0;
}
</style>
