<script setup>

const props = defineProps({
    fieldName: String, // Field identifier
    modelValue: [String, Number], // Supports text, numbers
    isEditable: Boolean, // Controls edit mode
    type: {
        type: String,
        default: "text", // Default is text field, but can be overridden
    },
    label: String,
    name: String,
});

const emit = defineEmits(["update:modelValue"]);
</script>

<template>
    <template v-if="isEditable">
        <div>{{label}}<template v-if="label">: </template>{{name}}<input
            :type="type"
            :name="fieldName"
            :value="modelValue"
            class="form-control"
            @input="$emit('update:modelValue', $event.target.value)"
        /></div>
    </template>
    <template v-else>
        <div v-if="modelValue">{{label}}<template v-if="label">:</template>
            {{name}} ({{ modelValue }})
        </div>
    </template>
</template>
