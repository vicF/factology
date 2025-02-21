<script setup>
import { defineProps, defineEmits } from "vue";

const props = defineProps({
    fieldName: String, // Field identifier
    modelValue: [String, Number], // Supports text, numbers
    isEditable: Boolean, // Controls edit mode
    options: {
        type: Object, // Now an object with key-value pairs
        required: true,
    },
});

const emit = defineEmits(["update:modelValue"]);

// Handle radio button selection
const handleInput = (event) => {
    emit("update:modelValue", event.target.value);
};
</script>

<template>
    <template v-if="isEditable">
        <div v-for="(label, value) in options" :key="value">
            <label>
                <input
                    type="radio"
                    :name="fieldName"
                    :value="value"
                    :checked="modelValue === value"
                    @input="handleInput"
                />
                {{ label }}
            </label>
        </div>
    </template>
    <template v-else>
        <div>
            {{ options[modelValue] || "No selection" }}
        </div>
    </template>
</template>
