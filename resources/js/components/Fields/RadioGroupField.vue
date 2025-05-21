<script setup>

const props = defineProps({
    fieldName: String, // Field identifier
    modelValue: [String, Number], // Supports text, numbers
    isEditable: Boolean, // Controls edit mode
    options: {
        type: Object, // Object with key-value pairs
        required: true,
    },
    label: String
});

const emit = defineEmits(["update:modelValue"]);

// Handle radio button selection
const handleInput = (event) => {
    emit("update:modelValue", event.target.value);
};
</script>

<template>
    <template v-if="isEditable">
        <div class="radio-group"><template v-if="label">{{label}}:</template>
            <div v-for="(label, value) in options" :key="value" class="radio-option">
                <label>
                    <input
                        type="radio"
                        :name="fieldName"
                        :value="value"
                    :checked="modelValue == value"
                    @input="handleInput"
                    />
                    {{ label }}
                </label>
            </div>
        </div>
    </template>
    <template v-else>
        <div>
            {{label}}: {{ options[modelValue] || "No selection" }}
        </div>
    </template>
</template>

<style scoped>
.radio-group {
    display: flex; /* Makes the container a flexbox */
    gap: 10px; /* Adds spacing between radio buttons */
}

.radio-option {
    display: inline-block; /* Ensures each radio button is inline */
}
</style>
