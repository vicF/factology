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
            <Image
                :node-id="id"
                width="18px"
                style="padding-right: 4px"
            />
            <div class="node-content">
                <span class="node-name">
                    <router-link class="dropdown-item" :to="`/object/${id}`">{{ name }}</router-link>
                    <span v-if="isPrivate" class="private-icon" title="Private"><IconPrivate v-if="isPrivate" /></span>
                </span>
                <span class="action-icons" :class="{ 'visible': authenticated && showIcons }">
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
                :public="node.public"
                @update-checked="handleCheckedUpdate"
            ></tree-menu>
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useSearchStore } from '../stores/search';
import { eventBus } from '../eventBus';
import { LINK_TO_CLASS, THING_TYPE, CLASS_TYPE, LINK_TO_PARENT } from '../constants.js';
import { useAuthStore } from "../stores/auth";
import Image from "./Image.vue";
import {IconPrivate} from "./icons";

const authStore = useAuthStore();
const authenticated = computed(() => authStore.authenticated);

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
    },
    public: {
        type: Number,
        default: 1          // 1 = public, 0 = private
    }
});

// Emits definition
const emit = defineEmits(['update-checked']);

defineOptions({ name: 'tree-menu' });

const store = useSearchStore();

// State
const showChildren = ref(true);
const showIcons = ref(false);

// Computed
const isChecked = computed(() => store.checkedItems.includes(props.id));
const showToggle = computed(() => props.nodes && props.nodes.length > 0);
const indent = computed(() => ({ marginLeft: `${props.depth * 15}px` }));
const isPrivate = computed(() => !props.public);

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
    const initialLinkedObjects = [];
    if (props.id) {
        initialLinkedObjects.push({
            one_thing_id: props.id,
            link_type_id: LINK_TO_PARENT,
            description: `Subclass of ${props.name}`,
        });
    }
    const payload = {
        title: `Create Subclass of "${props.name}"`,
        params: { type: CLASS_TYPE },
        initialLinkedObjects,
        callback: {
            type: 'class-created',
            parentId: props.id,
            parentName: props.name
        }
    };
    eventBus.emit('open-create-modal', payload);
};

// Create an object of this class (Thing type)
const openCreateObjectModal = () => {
    console.log('TreeMenu.vue - Creating object of class:', props.name);
    const initialLinkedObjects = [];
    if (props.id) {
        initialLinkedObjects.push({
            other_thing_id: props.id,
            link_type_id: LINK_TO_CLASS,
            description: `Object of class ${props.name}`,
        });
    }
    const payload = {
        title: `Create Object of Class "${props.name}"`,
        params: {
            type: THING_TYPE,
            classId: props.id,
            className: props.name,
        },
        initialLinkedObjects,
        callback: {
            type: 'object-created',
            classId: props.id,
            className: props.name
        }
    };
    eventBus.emit('open-create-modal', payload);
};

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
    display: inline-flex;
    align-items: center;
    gap: 4px;
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
