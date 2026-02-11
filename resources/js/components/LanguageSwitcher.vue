<template>
    <div>
        <button @click="changeLanguage('en')" :class="{ active: locale === 'en' }">
            English
        </button>
        <button @click="changeLanguage('ru')" :class="{ active: locale === 'ru' }">
            Русский
        </button>
    </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n';
import { setLanguage } from "../lang/i18n.js";

const { locale } = useI18n();

const changeLanguage = (lang) => {
    setLanguage(lang);
};
</script>

<style scoped>
button {
    margin: 5px;
    padding: 2px;
    border: none;
    cursor: pointer;
}
.active {
    font-weight: bold;
    text-decoration: underline;
}
</style>
