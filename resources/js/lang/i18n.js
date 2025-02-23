import { createI18n } from 'vue-i18n';

const messages = {
    en: {
        Start: "Start",
        End: "End",
        Birth: "Birth",
        Death: "Death",

    },
    ru: {
        Start: "Старт",
        End: "Конец",
        Birth: "Рождение",
        Death: "Смерть",
        "Record created":"Запись создана",
        "Record updated":"Последнее изменение",
        Access: "Доступ",
        Public:"Публичный",
        Private:"Приватный",
    }
};

const i18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: localStorage.getItem('locale') || 'en',
    fallbackLocale: 'en',
    messages,
});

// Custom translation function for context
i18n.global.tc = function(key, contextId) {
    let newKey = key; // Default to the key passed in if no context matches

    // Context-specific logic for "Start" and "End"
    switch (contextId) {
        case "4c8ee41a-9912-4dff-8b44-7779a66e4fcf":
        case "another-context-id":
            switch (key) {
                case "Start":
                    newKey = "Birth";
                    break;
                case "End":
                    newKey = "Death";
                    break;
                // Add more cases here if needed
                default:
                    newKey = key;
            }
            break;
    }

    // Use the original $t function with the potentially modified key
    return this.t(newKey);
};

export function setLanguage(lang) {
    i18n.global.locale = lang;
    localStorage.setItem("locale", lang);
    window.location.reload();
}

export default i18n;
