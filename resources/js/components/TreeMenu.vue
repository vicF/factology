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
            <input type="checkbox" :value="id" :checked="isChecked" :indeterminate="isSemi" @change="onCheckboxChange" />
            <Image
                :node-id="id"
                width="18px"
                style="padding-right: 4px"
            />
            <div class="node-content">
                <span class="node-name">
                    <router-link class="dropdown-item" :to="`/object/${id}`">{{ displayName }}</router-link>
                    <span v-if="authenticated && editMode && !nodePublic" class="private-icon" :title="$t('Private')" @click.stop="toggleVisibility(true)"><IconPrivate /></span>
                    <span v-if="authenticated && editMode && nodePublic && showIcons" class="public-icon" :title="$t('Public')" @click.stop="toggleVisibility(false)"><IconPublic /></span>
                </span>
                <span class="action-icons" :class="{ 'visible': authenticated && editMode && showIcons }">
                    <span class="add-subclass" @click="openCreateSubclassModal" :title="$t('Add child class below {name}', { name: displayName })">+</span>
                    <span class="add-object" @click="openCreateObjectModal" :title="$t('Create object of class {name}', { name: displayName })">📦</span>
                </span>
            </div>
        </div>
        <ConfirmModal
            :show="showConfirmModal"
            :title="confirmTitle"
            :message="confirmMessage"
            :confirm-text="confirmButtonText"
            :variant="confirmVariant"
            @confirm="handleToggleConfirm"
            @cancel="showConfirmModal = false"
        />
        <div class="children" v-if="showChildren">
            <tree-menu
                v-for="node in nodes"
                :key="node.id"
                :id="node.id"
                :nodes="node.nodes"
                :name="node.name"
                :translations="node.name_translations"
                :depth="depth + 1"
                :checked-items="checkedItems"
                :public="node.public"
                :type="node.type"
                @update-checked="handleCheckedUpdate"
            ></tree-menu>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import axios from 'axios';
import { useSearchStore } from '../stores/search';
import { useObjectsStore } from '../stores/objects';
import { eventBus } from '../eventBus';
import { LINK_TO_CLASS, THING_TYPE, CLASS_TYPE, LINK_TYPE, LINK_TO_PARENT } from '../constants.js';
import { useAuthStore } from "../stores/auth";
import { useUiStore } from '../stores/ui';
import { fieldText } from '../utils/localized.js';
import { collectSubtreeIds, nodeSelectionState } from '../utils/classTree';
import { useTreeState } from "../composables/useTreeState";
import Image from "./Image.vue";
import {IconPrivate, IconPublic} from "./icons";
import ConfirmModal from './ConfirmModal.vue';

const authStore = useAuthStore();
const authenticated = computed(() => authStore.authenticated);
const uiStore = useUiStore();
const editMode = computed(() => uiStore.editMode);
const { t } = useI18n();

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
    },
    translations: {
        type: Object,
        default: null
    },
    type: {
        type: Number,
        default: null
    }
});

// Emits definition
const emit = defineEmits(['update-checked']);

// Resolve the class name in the current UI language
const displayName = computed(() => fieldText(props.name, props.translations));

defineOptions({ name: 'tree-menu' });

const store = useSearchStore();
const objectsStore = useObjectsStore();

// State
const treeState = useTreeState();
const showChildren = ref(treeState.isOpen(props.id, props.depth));
const showIcons = ref(false);

// ─── Quick visibility toggle state ─────────────────────────────────
let quickMode = false;
const showConfirmModal = ref(false);
const confirmTitle = ref('');
const confirmMessage = ref('');
const confirmButtonText = ref('');
const confirmVariant = ref('primary');
let pendingToggle = null;

// Local copy of public state for toggle UI feedback
const nodePublic = ref(!!props.public);
watch(() => props.public, (val) => { nodePublic.value = !!val; });

const toggleVisibility = (makePublic) => {
    if (quickMode) {
        executeToggle(makePublic);
        return;
    }
    if (makePublic) {
        confirmTitle.value = t('Make Public');
        confirmMessage.value = t('Make this class visible to everyone?');
        confirmButtonText.value = t('Make Public');
        confirmVariant.value = 'success';
    } else {
        confirmTitle.value = t('Make Private');
        confirmMessage.value = t('Make this class private? Only you will be able to see it.');
        confirmButtonText.value = t('Make Private');
        confirmVariant.value = 'danger';
    }
    pendingToggle = makePublic;
    showConfirmModal.value = true;
};

const handleToggleConfirm = () => {
    showConfirmModal.value = false;
    if (pendingToggle === null) return;
    const makePublic = pendingToggle;
    pendingToggle = null;
    quickMode = true;
    executeToggle(makePublic);
};

const executeToggle = async (makePublic) => {
    try {
        await axios.patch(`/object/${props.id}/visibility`, { public: makePublic ? 1 : 0 });
        nodePublic.value = makePublic;
    } catch (error) {
        console.error('Failed to toggle visibility:', error);
    }
};

// Computed
const subtreeIds = computed(() => [props.id, ...collectSubtreeIds(props.nodes)]);
const nodeState = computed(() => nodeSelectionState(props.id, props.nodes, store.checkedItems));
// :checked must only be true for fully-checked nodes. Semi nodes render the
// dash via :indeterminate over an unchecked box, so clicking them toggles the
// native checked false→true, which Vue then patches to a real check — the
// stale-state bug (parent visually unchecked after re-checking a semi node)
// came from binding checked=true on semi nodes.
const isChecked = computed(() => nodeState.value === 'checked');
const isSemi = computed(() => nodeState.value === 'semi');
const showToggle = computed(() => props.nodes && props.nodes.length > 0);
const indent = computed(() => ({ marginLeft: `${props.depth * 15}px` }));

// Methods
const toggleChildren = () => {
    showChildren.value = !showChildren.value;
    treeState.setOpen(props.id, showChildren.value);
};

const onCheckboxChange = () => {
    // Branch on the derived state, not event.target.checked: clicking a
    // semi (indeterminate) checkbox reports checked=true natively.
    if (nodeState.value === 'semi') {
        store.checkSubtree(subtreeIds.value);
    } else if (nodeState.value === 'checked') {
        store.uncheckSubtree(subtreeIds.value);
        // Drop now-empty parents (and their ancestors) that lost every
        // selected descendant, up to the tree root.
        store.pruneEmptyAncestors(objectsStore.rootNodes);
    } else {
        store.checkSubtree(subtreeIds.value);
    }
    emit('update-checked', store.checkedItems);
    eventBus.emit('trigger-search');
};

// Create a subclass (Class type) — or a sub link type when the parent node is
// a link type (a more specific relationship, e.g. "knows of" → "read a book").
const openCreateSubclassModal = () => {
    const isLinkTypeNode = props.type === LINK_TYPE;
    console.log(`TreeMenu.vue - Creating ${isLinkTypeNode ? 'link type' : 'subclass'} of:`, props.name);
    const initialLinkedObjects = [];
    if (props.id) {
        initialLinkedObjects.push({
            one_thing_id: props.id,
            link_type_id: LINK_TO_PARENT,
            description: `${isLinkTypeNode ? 'Link type' : 'Subclass'} of ${props.name}`,
        });
    }
    const payload = {
        title: `Create ${isLinkTypeNode ? 'Link Type' : 'Subclass'} of "${props.name}"`,
        params: { type: isLinkTypeNode ? LINK_TYPE : CLASS_TYPE },
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
.private-icon {
    display: inline-flex;
    vertical-align: middle;
}
.public-icon {
    display: inline-flex;
    vertical-align: middle;
}
.children {
    padding-left: 0;
}
</style>
