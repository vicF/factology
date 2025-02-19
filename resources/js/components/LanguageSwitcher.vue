<template>
    <div>
        <button @click="changeLanguage('en')" :class="{ active: currentLocale === 'en' }">
            English
        </button>
        <button @click="changeLanguage('ru')" :class="{ active: currentLocale === 'ru' }">
            Русский
        </button>
    </div>
</template>

<script>
import { setLanguage } from "../lang/i18n.js";

export default {
    data() {
        return {
            currentLocale: this.$i18n.locale
        };
    },
    methods: {
        changeLanguage(lang) {
            setLanguage(lang);
            // Update local state to reflect the change without needing a page reload
            this.currentLocale = lang;
        }
    },
    watch: {
        // Watch for changes in the i18n locale and update currentLocale
        '$i18n.locale'(newLocale) {
            this.currentLocale = newLocale;
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
