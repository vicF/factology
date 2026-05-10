<template>
    <div class="private-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
            <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm240-160q33 0 56.5-23.5T560-320q0-33-23.5-56.5T480-400q-33 0-56.5 23.5T400-320q0 33 23.5 56.5T480-240ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/>
        </svg>
    </div>
</template>

<script setup>
defineOptions({ name: 'IconPrivate' })
</script>

<style scoped>
.private-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: #dc3545;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.private-icon:hover {
    background: #b02a37;
    transform: scale(1.1);
}
.private-icon svg {
    width: 10px;
    height: 10px;
    color: white;
    fill: white;
    display: block;
}
</style>
