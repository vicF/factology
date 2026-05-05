<!-- resources/js/components/icons/IconClass.vue -->
<template>
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
    >
        <!-- Top node (parent) -->
        <rect x="9" y="2" width="6" height="5" rx="0.5" />

        <!-- Bottom-left node (child) -->
        <rect x="3" y="14" width="6" height="5" rx="0.5" />

        <!-- Bottom-right node (child) -->
        <rect x="15" y="14" width="6" height="5" rx="0.5" />

        <!-- Vertical line from top node down -->
        <line x1="12" y1="7" x2="12" y2="10" />

        <!-- Horizontal line connecting the two child positions -->
        <line x1="6" y1="10" x2="18" y2="10" />

        <!-- Vertical line down to left child -->
        <line x1="6" y1="10" x2="6" y2="14" />

        <!-- Vertical line down to right child -->
        <line x1="18" y1="10" x2="18" y2="14" />
    </svg>
</template>

<script setup>
defineOptions({ name: 'IconClass' })
</script>
