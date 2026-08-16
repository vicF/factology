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
        "Edit mode is on — click to switch to view mode": "Edit mode is on — click to switch to view mode",
        "View mode is on — click to switch to edit mode": "View mode is on — click to switch to edit mode",

        // ── Flexible dates ──
        "dates.before": "before",
        "dates.after": "after",
        "dates.between": "between",
        "dates.and": "and",
        "dates.or": "or",
        "dates.circa": "circa",
        "dates.unknown": "unknown",
        "dates.bc": "BC",
        "dates.preview": "Normalized",
        "dates.parse_error": "Could not parse this date expression",
        "dates.placeholder": "e.g. 1650, circa 1650, before 1500, between 1500 and 1600, 7533 AM",
        "dates.placeholder_upper": "upper bound",
        "dates.placeholder_alternatives": "alternatives, comma-separated (e.g. 1650, 1670)",
        "dates.comment": "comment",
        "dates.disabled": "Defined by the start-date range",
        "dates.qualifier.exact": "Exact",
        "dates.qualifier.approx": "Circa / Approx",
        "dates.qualifier.before": "Before",
        "dates.qualifier.after": "After",
        "dates.qualifier.between": "Between",
        "dates.qualifier.alternatives": "One of several",
        "dates.qualifier.unknown": "Unknown",
        "dates.precision.year": "Year",
        "dates.precision.month": "Month",
        "dates.precision.day": "Day",
        "dates.precision.minute": "Minute",
        "dates.precision.second": "Second",
        "era.gregorian": "Gregorian",
        "era.julian": "Julian (old style)",
        "era.world_creation": "From world creation",
        "era.hijri": "Hijri",
        "era.hebrew": "Hebrew",

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
        "Failed to load document": "Не удалось загрузить документ",
        "Edit mode is on — click to switch to view mode": "Режим редактирования включен — нажмите, чтобы переключиться в режим просмотра",
        "View mode is on — click to switch to edit mode": "Режим просмотра включен — нажмите, чтобы переключиться в режим редактирования",

        // ── Flexible dates ──
        "dates.before": "до",
        "dates.after": "после",
        "dates.between": "между",
        "dates.and": "и",
        "dates.or": "или",
        "dates.circa": "около",
        "dates.unknown": "неизвестно",
        "dates.bc": "до н.э.",
        "dates.preview": "Нормализовано",
        "dates.parse_error": "Не удалось разобрать выражение даты",
        "dates.placeholder": "например: 1650, около 1650, до 1500, между 1500 и 1600, 7533 от сотворения мира",
        "dates.placeholder_upper": "верхняя граница",
        "dates.placeholder_alternatives": "варианты через запятую (напр. 1650, 1670)",
        "dates.comment": "комментарий",
        "dates.disabled": "Определено диапазоном даты начала",
        "dates.qualifier.exact": "Точно",
        "dates.qualifier.approx": "Приблизительно",
        "dates.qualifier.before": "До",
        "dates.qualifier.after": "После",
        "dates.qualifier.between": "Между",
        "dates.qualifier.alternatives": "Один из вариантов",
        "dates.qualifier.unknown": "Неизвестно",
        "dates.precision.year": "Год",
        "dates.precision.month": "Месяц",
        "dates.precision.day": "День",
        "dates.precision.minute": "Минута",
        "dates.precision.second": "Секунда",
        "era.gregorian": "Григорианский",
        "era.julian": "Юлианский (ст. ст.)",
        "era.world_creation": "От сотворения мира",
        "era.hijri": "Хиджра",
        "era.hebrew": "Еврейский"
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
    // i18n.global.locale is a ref (WritableComputedRef) — set `.value`.
    // Assigning `i18n.global.locale = lang` would replace the ref with a plain
    // string (or throw on a frozen composer), breaking currentLocale()/locale.value.
    if (i18n.global.locale && typeof i18n.global.locale === 'object' && 'value' in i18n.global.locale) {
        i18n.global.locale.value = lang;
    } else {
        i18n.global.locale = lang;
    }
    localStorage.setItem("locale", lang);
    window.location.reload();
}

export { i18n };

export default i18n;
