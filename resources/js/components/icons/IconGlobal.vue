<template>
    <div class="global-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
            <path d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q133 0 226.5-94T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 92.5 226.5T480-160Zm-40-120v-80h80v80h-80Zm0-160v-40q0-33 16-55t44-39q24-14 42.5-32t18.5-44q0-33-23.5-53.5T480-720q-30 0-52 14t-34 36l-74-30q20-44 58-68t82-24q68 0 119 43t51 109q0 38-22 65t-46 45q-22 16-36 29.5T520-520v40h-80Z"/>
        </svg>
    </div>
</template>

<script setup>
defineOptions({ name: 'IconGlobal' })
</script>

<style scoped>
.global-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: #ffc107;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.global-icon:hover {
    background: #e0a800;
    transform: scale(1.1);
}
.global-icon svg {
    width: 10px;
    height: 10px;
    color: white;
    fill: white;
    display: block;
}
</style>