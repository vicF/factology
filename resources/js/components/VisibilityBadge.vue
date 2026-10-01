<template>
    <div
        class="visibility-badge"
        :title="tooltip"
        @click="handleToggle"
    >
        <IconPrivate v-if="visibility === 0" />
        <IconPublic v-else-if="visibility === 1" />
        <IconGlobal v-else-if="visibility === 2" />
        <IconPrivate v-else-if="visibility === 3" />
        <IconPrivate v-else />
    </div>
</template>

<script setup>
import { computed } from 'vue';
import IconPrivate from './icons/IconPrivate.vue';
import IconPublic from './icons/IconPublic.vue';
import IconGlobal from './icons/IconGlobal.vue';

const props = defineProps({
    visibility: { type: Number, default: 0 },
    disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['toggle']);

const tooltip = computed(() => {
    const labels = {
        0: 'Private',
        1: 'Public',
        2: 'Global',
        3: 'Group (reserved)',
    };
    return labels[props.visibility] ?? 'Private';
});

function handleToggle() {
    if (!props.disabled) {
        emit('toggle');
    }
}
</script>

<style scoped>
.visibility-badge {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    transition: all 0.2s ease;
}
</style>