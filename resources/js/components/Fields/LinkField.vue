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

<template><TextField
    fieldName="link_description"
    v-model="object.name"
    :isEditable="isEditable"
/>
    <template v-if="isEditable">
        <div>{{label}}<template v-if="label">:</template><input
            :type="type"
            :name="fieldName"
            :value="modelValue"
            class="form-control"
            @input="$emit('update:modelValue', $event.target.value)"
        /></div>
    </template>
    <template v-else>
        <div v-if="modelValue">{{label}}<template v-if="label">:</template>
            {{ modelValue }}
        </div>
    </template>
</template>
