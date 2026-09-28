<template>
    <span v-if="visible" class="match-status-icon" :class="iconClass" :title="tooltip" @click="$emit('open-dialog')">
        <!-- MusicBrainz-styled "M" icon varying by state -->
        <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Circle background -->
            <circle cx="12" cy="12" r="10" :stroke="strokeColor" stroke-width="1.5" :fill="fillColor" />
            <!-- M letter -->
            <path d="M7 17V7l5 6 5-6v10" :stroke="strokeColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <!-- State-specific overlay -->
            <!-- Error: exclamation mark -->
            <template v-if="state === 'error'">
                <line x1="12" y1="8" x2="12" y2="13" :stroke="strokeColor" stroke-width="2" stroke-linecap="round" />
                <circle cx="12" cy="16" r="0.8" :fill="strokeColor" />
            </template>
            <!-- Pending: question mark -->
            <template v-if="state === 'pending'">
                <path d="M12 8a2.5 2.5 0 1 0 0 3.5" :stroke="strokeColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="12" cy="15" r="0.7" :fill="strokeColor" />
            </template>
            <!-- Unmatched: X -->
            <template v-if="state === 'unmatched'">
                <line x1="9" y1="9" x2="15" y2="15" :stroke="strokeColor" stroke-width="1.5" stroke-linecap="round" />
                <line x1="15" y1="9" x2="9" y2="15" :stroke="strokeColor" stroke-width="1.5" stroke-linecap="round" />
            </template>
            <!-- Rejected: slash -->
            <template v-if="state === 'rejected'">
                <line x1="7" y1="17" x2="17" y2="7" :stroke="strokeColor" stroke-width="1.5" stroke-linecap="round" />
            </template>
        </svg>
    </span>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    /** Match state string: none | error | pending | unmatched | rejected | searching */
    state: { type: String, default: 'none' },
    /** Icon size in px */
    size: { type: Number, default: 18 },
    /** Whether the icon is clickable */
    clickable: { type: Boolean, default: true },
});

defineEmits(['open-dialog']);

const states = ['none', 'error', 'pending', 'unmatched', 'rejected', 'searching'];

const visible = computed(() => states.includes(props.state));

const iconClass = computed(() => ({
    'state-none': props.state === 'none',
    'state-error': props.state === 'error',
    'state-pending': props.state === 'pending',
    'state-unmatched': props.state === 'unmatched',
    'state-rejected': props.state === 'rejected',
    'state-searching': props.state === 'searching',
    clickable: props.clickable,
}));

const strokeColor = computed(() => {
    switch (props.state) {
        case 'none': return '#9ca3af';      // gray-400
        case 'error': return '#d97706';     // amber-600
        case 'pending': return '#2563eb';   // blue-600
        case 'unmatched': return '#dc2626'; // red-600
        case 'rejected': return '#9ca3af';  // gray-400
        case 'searching': return '#2563eb'; // blue-600
        default: return '#9ca3af';
    }
});

const fillColor = computed(() => {
    switch (props.state) {
        case 'none': return '#f3f4f6';      // gray-100
        case 'error': return '#fef3c7';     // amber-100
        case 'pending': return '#dbeafe';   // blue-100
        case 'unmatched': return '#fee2e2'; // red-100
        case 'rejected': return '#f3f4f6';  // gray-100
        case 'searching': return '#dbeafe'; // blue-100
        default: return '#f3f4f6';
    }
});

const tooltip = computed(() => {
    switch (props.state) {
        case 'none': return 'MusicBrainz: not checked yet';
        case 'error': return 'MusicBrainz: error, will retry';
        case 'pending': return 'MusicBrainz: match found — click to review';
        case 'unmatched': return 'MusicBrainz: no match found — click to search';
        case 'rejected': return 'MusicBrainz: matches rejected';
        case 'searching': return 'MusicBrainz: searching…';
        default: return '';
    }
});
</script>

<style scoped>
.match-status-icon {
    display: inline-flex;
    align-items: center;
    cursor: default;
    margin-left: 4px;
    vertical-align: middle;
    line-height: 0;
}

.match-status-icon.clickable {
    cursor: pointer;
}

.match-status-icon.clickable:hover {
    opacity: 0.8;
}
</style>