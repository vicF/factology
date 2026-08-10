<template>
    <span v-if="active" class="translated-badge" :title="$t('Translated to other languages')" aria-label="Translated">🌐</span>
</template>

<script setup>
import { computed } from 'vue';
import { hasOtherTranslations } from '../utils/localized.js';

const props = defineProps({
    // A field's translations map ({ lang, <code>: text, ... }) or null
    translations: { type: [Object, null], default: null },
});

const active = computed(() => hasOtherTranslations(props.translations));
</script>

<style scoped>
.translated-badge {
    margin-left: 6px;
    font-size: 0.85em;
    cursor: help;
    opacity: 0.85;
    vertical-align: middle;
}
</style>
