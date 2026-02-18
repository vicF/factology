<script setup>
import TextField from "./TextField.vue";

const props = defineProps({
    fieldName: String, // Field identifier
    modelValue: [String, Number], // Supports text, numbers
    isEditable: Boolean, // Controls edit mode
    type: {
        type: String,
        default: "text", // Default is text field, but can be overridden
    },
    label: String,
});

const emit = defineEmits(["update:modelValue"]);
</script>

<template>
    <template v-if="isEditable">
        <div class="mb-3">
            <label v-if="label" :for="fieldName" class="form-label">{{ label }}</label>
            <input
                :type="type"
                :name="fieldName"
                :id="fieldName"
                :value="modelValue"
                class="form-control"
                @input="$emit('update:modelValue', $event.target.value)"
            />
        </div>
    </template>
    <template v-else>
        <div v-if="modelValue" class="field-display">
            <span v-if="label" class="field-label">{{ label }}:</span>
            <span class="field-value">{{ modelValue }}</span>
        </div>
    </template>
</template>
