import { createI18n } from 'vue-i18n';

const messages = {
    en: {
        Start: "Start",
        start_context: {
            "4c8ee41a-9912-4dff-8b44-7779a66e4fcf": "Birth"
        },
        Access:"Access"
    },
    ru: {
        Start: "Старт",
        start_context: {
            "4c8ee41a-9912-4dff-8b44-7779a66e4fcf": "Рождение"
        },
        Access:"Доступ"
    }
};

const i18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: localStorage.getItem('locale') || 'en',
    fallbackLocale: 'en',
    messages,
});

export function setLanguage(lang) {
    i18n.global.locale = lang;
    localStorage.setItem("locale", lang);
    // Instead of reload, you might want to use:
    // window.location.reload();
}

export default i18n;
