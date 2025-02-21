<script setup>
import {defineProps, defineEmits} from "vue";

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
        <div>{{label}}<input
            :type="type"
            :name="fieldName"
            :value="modelValue"
            class="form-control"
            @input="$emit('update:modelValue', $event.target.value)"
        /></div>
    </template>
    <template v-else>
        <div v-if="modelValue">{{label}}<template v-if="label">:</template>
            {{$dateFromDb(modelValue) }}
        </div>
    </template>
</template>
