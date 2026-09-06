<template>
    <div class="of-item">
        <div class="of-row" :style="{ paddingLeft: depth * 16 + 'px' }">
            <span
                v-if="hasChildren"
                class="of-caret"
                :class="{ open }"
                @click="toggleOpen"
            ></span>
            <span v-else class="of-caret-spacer"></span>

            <input
                type="checkbox"
                class="of-checkbox"
                :value="node.id"
                :checked="isChecked"
                :indeterminate="isSemi"
                :aria-label="displayName"
                @change="onChange"
            />

            <Image :node-id="node.id" :type="node.type" width="16px" class="of-icon" />

            <span class="of-name" :title="displayName">
                {{ displayName }}
                <span v-if="node.count" class="of-count">{{ node.count }}</span>
            </span>
        </div>

        <div v-if="open && hasChildren" class="of-children">
            <ObjectFilterItem
                v-for="child in node.nodes"
                :key="child.id"
                :node="child"
                :depth="depth + 1"
                :checked-ids="checkedIds"
                @change="(n) => emit('change', n)"
            />
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { fieldText } from '../utils/localized.js';
import { nodeSelectionState } from '../utils/classTree';
import Image from './Image.vue';

/**
 * One row of the object-page filter tree. Tri-state checkbox behaviour mirrors
 * the search classes tree: a leaf is checked when its id is in `checkedIds`;
 * a node with children is derived from how much of its subtree is selected.
 * The actual selection mutations happen in the parent (ObjectViewSidebar),
 * which owns the checked-id set — this component only reports changes.
 */
defineOptions({ name: 'ObjectFilterItem' });

const props = defineProps({
    node: { type: Object, required: true },
    depth: { type: Number, default: 0 },
    checkedIds: { type: Array, default: () => [] },
});

const emit = defineEmits(['change']);

const hasChildren = computed(() => (props.node.nodes || []).length > 0);

// Local expand/collapse state (the tree starts fully expanded so all used
// classes/types are visible without interaction).
const open = ref(true);
const toggleOpen = () => { open.value = !open.value; };

const displayName = computed(() =>
    fieldText(props.node.name, props.node.name_translations) || props.node.name || ''
);

const nodeState = computed(() =>
    nodeSelectionState(props.node.id, props.node.nodes || [], props.checkedIds)
);
const isChecked = computed(() => nodeState.value === 'checked');
const isSemi = computed(() => nodeState.value === 'semi');

// A semi (indeterminate) checkbox reports native checked=true; branch on the
// derived state instead, exactly like TreeMenu does.
const onChange = () => {
    emit('change', props.node);
};
</script>

<style scoped>
.of-item {
    user-select: none;
}
.of-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 22px;
    padding-right: 4px;
    line-height: 1.2;
}
.of-caret {
    width: 14px;
    height: 16px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 11px;
    color: #6c757d;
    text-align: center;
}
.of-caret::before {
    content: '+';
}
.of-caret.open::before {
    content: '−';
}
.of-caret-spacer {
    width: 14px;
    flex-shrink: 0;
}
.of-checkbox {
    margin: 0;
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    cursor: pointer;
}
.of-icon {
    flex-shrink: 0;
}
.of-name {
    font-size: 0.78rem;
    color: #343a40;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}
.of-count {
    font-size: 0.66rem;
    color: #adb5bd;
    background: #f1f3f5;
    border-radius: 8px;
    padding: 0 5px;
    margin-left: 3px;
    flex-shrink: 0;
}
.of-children {
    display: flex;
    flex-direction: column;
}
</style>
