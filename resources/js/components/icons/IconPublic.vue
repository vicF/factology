<template>
    <div class="public-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
            <path d="M200-80q-33 0-56.5-23.5T120-160v-400q0-33 23.5-56.5T200-640h40v-80q0-83 58.5-141.5T480-920q63 0 115 33t77 87l-72 30q-17-35-49.5-56T480-840q-50 0-85 35t-35 85v80h280v80H240v400h480v-280h80v280q0 33-23.5 56.5T720-80H200Z"/>
        </svg>
    </div>
</template>

<script setup>
defineOptions({ name: 'IconPublic' })
</script>

<style scoped>
.public-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: #28a745;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.public-icon:hover {
    background: #1e7e34;
    transform: scale(1.1);
}
.public-icon svg {
    width: 10px;
    height: 10px;
    color: white;
    fill: white;
    display: block;
}
</style>
