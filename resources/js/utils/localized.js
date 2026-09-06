// resources/js/utils/localized.js
//
// Resolution helpers for localized object data.
//
// Storage convention:
//  - `name` / `description` are plain scalar fields (the "main/original" value).
//  - `name_translations` / `description_translations` are maps:
//      { "lang": <code of the plain field's language>, <code>: <translation>, ... }
//    `lang` is a RESERVED key (the language of the plain field). The remaining
//    keys are translations that differ from the original (no duplication).
//  - `data.properties` maps a property thing_id to a value which is either a
//    plain scalar, a `{ lang-code: text }` localized map, or `{ value, unit }`.

import { i18n } from '../lang/i18n';
import { isGeoJsonGeometry } from './geo.js';

/** Current UI locale from vue-i18n. */
export function currentLocale() {
    const loc = i18n?.global?.locale;
    if (loc == null) return 'en';
    // A plain string means the locale was (incorrectly) assigned directly; a ref has .value.
    return typeof loc === 'string' ? loc : (loc.value ?? 'en');
}

/** True if `value` looks like a field translations map (has the reserved `lang` key). */
export function isTranslationsMap(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value) && 'lang' in value;
}

/** First non-empty translation of a map, skipping the reserved `lang` key. */
function firstTranslation(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return '';
    for (const [key, value] of Object.entries(map)) {
        if (key !== 'lang' && value != null && String(value).trim() !== '') return value;
    }
    return '';
}

/**
 * Resolve a field for a locale.
 * Order: translations[locale] → plain field → first other translation.
 */
export function fieldText(plain, translations, locale = currentLocale()) {
    if (translations && typeof translations === 'object' && !Array.isArray(translations)) {
        if (translations[locale] != null && String(translations[locale]).trim() !== '') {
            return translations[locale];
        }
        if (plain != null && String(plain).trim() !== '') {
            return plain;
        }
        return firstTranslation(translations);
    }
    return plain ?? '';
}

/**
 * Resolve a property value for a locale.
 * Handles: plain scalar → as-is; {code: text} map → [locale] else first; {value, unit} → nested value.
 */
export function resolveLocalized(value, locale = currentLocale()) {
    if (value == null) return '';
    if (typeof value !== 'object' || Array.isArray(value)) return value;
    if ('value' in value) {
        return resolveLocalized(value.value, locale);
    }
    const langs = Object.keys(value).filter((k) => k !== 'lang');
    if (langs.length === 0) return '';
    if (value[locale] != null && String(value[locale]).trim() !== '') return value[locale];
    for (const k of langs) {
        if (value[k] != null && String(value[k]).trim() !== '') return value[k];
    }
    return '';
}

/** Object's plain-field language (from name_translations.lang) — or 'en' if unknown. */
export function sourceLang(obj) {
    return obj?.name_translations?.lang || obj?.description_translations?.lang || 'en';
}

/** True when a field has translations in languages other than the plain field's own. */
export function hasOtherTranslations(translations) {
    if (!translations || typeof translations !== 'object' || Array.isArray(translations)) return false;
    return Object.keys(translations).some(
        (key) => key !== 'lang' && translations[key] != null && String(translations[key]).trim() !== ''
    );
}

/**
 * Build a fresh translations map with the text for `locale` set (or removed when empty),
 * preserving any existing entries.
 */
export function makeTranslationsMap(text, locale, existing = null) {
    const map = { ...(existing || {}) };
    if (text != null && String(text).trim() !== '') {
        map[locale] = text;
    } else {
        delete map[locale];
    }
    return map;
}

/**
 * Change the declared language of a field's plain value, keeping the text.
 * - newLang === oldLang → no-op.
 * - If a translation exists for newLang, it is promoted to the plain value and
 *   the old plain text moves to translations[oldLang] (all content preserved).
 * - Otherwise only the language tag changes (the plain text is untouched).
 */
export function changeSourceLang({ plain, translations, oldLang, newLang }) {
    const map = { ...(translations || {}) };
    if (!newLang || newLang === oldLang) return { plain: plain ?? '', translations: map };
    const outPlain = plain ?? '';
    const promoted = map[newLang];
    if (promoted != null && String(promoted).trim() !== '') {
        delete map[newLang];
        if (outPlain !== '') map[oldLang] = outPlain;
        return { plain: promoted, translations: map };
    }
    return { plain: outPlain, translations: map };
}

// ── Object convenience helpers ──────────────────────────────────────────────

export function objectName(obj, locale = currentLocale()) {
    if (!obj) return '';
    return fieldText(obj.name, obj.name_translations, locale);
}

export function objectDescription(obj, locale = currentLocale()) {
    if (!obj) return '';
    return fieldText(obj.description, obj.description_translations, locale);
}

// ── Search ──────────────────────────────────────────────────────────────────

function pushString(out, value) {
    if (value != null && String(value).trim() !== '') out.push(String(value));
}

function collectValue(out, value) {
    if (value == null) return;
    if (typeof value === 'object') {
        if (isGeoJsonGeometry(value)) return; // coordinates aren't searchable text
        if ('value' in value) {
            // structured { value, unit, ... } — collect the value once, then the
            // remaining metadata keys (unit etc.), skipping the reserved keys.
            collectValue(out, value.value);
            for (const [key, v] of Object.entries(value)) {
                if (key === 'lang' || key === 'value') continue;
                collectValue(out, v);
            }
        } else {
            for (const [key, v] of Object.entries(value)) {
                if (key === 'lang') continue; // metadata key, not content
                collectValue(out, v);
            }
        }
        return;
    }
    pushString(out, value);
}

function collectMap(out, map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    for (const [key, value] of Object.entries(map)) {
        if (key === 'lang') continue;
        collectValue(out, value);
    }
}

/** All searchable strings of an object (name/description + all translations + property values). */
/**
 * Get the list of class objects from an API response (multi-class).
 * Returns the `classes` array if non-empty, otherwise wraps the singular
 * `class` in a one-element array, or falls back to an empty array.
 * This centralises the fallback logic so templates don't repeat it.
 */
export function getClassesList(obj) {
    if (obj && Array.isArray(obj.classes) && obj.classes.length > 0) {
        return obj.classes;
    }
    if (obj && obj.class && obj.class.thing_id) {
        return [obj.class];
    }
    return [];
}

export function flattenSearchable(obj) {
    const out = [];
    if (!obj) return out;
    pushString(out, obj.name);
    pushString(out, obj.description);
    collectMap(out, obj.name_translations);
    collectMap(out, obj.description_translations);
    if (obj.data?.properties && typeof obj.data.properties === 'object') {
        for (const value of Object.values(obj.data.properties)) {
            collectValue(out, value);
        }
    }
    return out;
}
