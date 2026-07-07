import { createI18n } from 'vue-i18n';

const messages = {
    en: {
        Start: "Start",
        End: "End",
        Birth: "Birth",
        Death: "Death",
        "I accept the": "I accept the",
        "Terms of Service": "Terms of Service",
        "I consent to the": "I consent to the",
        "Privacy Policy": "Privacy Policy",
        "and agree to the processing of my personal data": "and agree to the processing of my personal data",
        Close: "Close",
        "Failed to load document": "Failed to load document",

    },
    ru: {
        Save: "Сохранить",
        Cancel: "Отменить",
        Create: "Создать",
        Start: "Начало",
        Edit: "Редактировать",
        End: "Конец",
        Birth: "Рождение",
        Death: "Смерть",
        "Record created":"Запись создана",
        "Record updated":"Последнее изменение",
        Access: "Доступ",
        Public:"Публичный",
        Private:"Приватный",
        Description: "Описание",
        "I accept the": "Я принимаю",
        "Terms of Service": "Пользовательское соглашение",
        "I consent to the": "Я даю согласие на",
        "Privacy Policy": "Политику конфиденциальности",
        "and agree to the processing of my personal data": "и соглашаюсь на обработку моих персональных данных",
        Close: "Закрыть",
        "Failed to load document": "Не удалось загрузить документ"
    }
};

const i18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: localStorage.getItem('locale') || 'en',
    fallbackLocale: 'en',
    messages,
    missing: (locale, key) => {
        // Suppress warnings for English by returning the key
        if (locale === 'en') {
            return key; // Use key as translation (e.g., "Access")
        }
        // For other locales, allow default warning behavior
        console.warn(`[vue-i18n] Missing translation for "${key}" in "${locale}"`);
        return key;
    },
    silentTranslationWarn: false, // Keep warnings for non-English locales
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
