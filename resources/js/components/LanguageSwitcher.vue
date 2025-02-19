<template>
    <div>
        <button @click="changeLanguage('en')" :class="{ active: $i18n.locale === 'en' }">
            English
        </button>
        <button @click="changeLanguage('ru')" :class="{ active: $i18n.locale === 'ru' }">
            Русский
        </button>
    </div>
</template>

<script>
import { setLanguage } from "../lang/i18n.js";

export default {
    methods: {
        changeLanguage(lang) {
            setLanguage(lang);
            window.location.reload(); // Обновляем страницу, чтобы язык изменился везде
        }
    }
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
