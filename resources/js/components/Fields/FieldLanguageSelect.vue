<template>
    <select
        class="form-select form-select-sm field-lang-select"
        :value="modelValue"
        @change="emit('update:modelValue', $event.target.value)"
    >
        <option v-for="l in options" :key="l.code" :value="l.code">{{ l.name }} ({{ l.code }})</option>
    </select>
</template>

<script setup>
const props = defineProps({
    modelValue: { type: String, default: '' },
    options: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue']);
</script>

<style scoped>
.field-lang-select {
    max-width: 150px;
    width: auto;
}
</style>
