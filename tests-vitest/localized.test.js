// tests-vitest/localized.test.js
import {
    fieldText,
    resolveLocalized,
    hasOtherTranslations,
    makeTranslationsMap,
    objectName,
    objectDescription,
    flattenSearchable,
    changeSourceLang,
} from '../resources/js/utils/localized.js';

describe('fieldText', () => {
    test('returns the translation for the requested locale', () => {
        expect(fieldText('остров', { lang: 'ru', en: 'island' }, 'en')).toBe('island');
    });

    test('returns the plain value when the requested locale is the field language', () => {
        expect(fieldText('остров', { lang: 'ru', en: 'island' }, 'ru')).toBe('остров');
    });

    test('falls back to the plain value when no translation exists', () => {
        expect(fieldText('остров', { lang: 'ru' }, 'de')).toBe('остров');
    });

    test('falls back to the first other translation when plain is empty', () => {
        expect(fieldText('', { lang: 'ru', en: 'island' }, 'de')).toBe('island');
    });

    test('returns plain when translations is null', () => {
        expect(fieldText('name', null, 'en')).toBe('name');
    });
});

describe('resolveLocalized (property values)', () => {
    test('passthrough for plain scalars', () => {
        expect(resolveLocalized('+1 555-1234', 'en')).toBe('+1 555-1234');
        expect(resolveLocalized(70, 'en')).toBe(70);
    });

    test('picks the requested locale from a map', () => {
        expect(resolveLocalized({ en: 'Jonny', ru: 'Ваня' }, 'ru')).toBe('Ваня');
    });

    test('falls back to the first entry', () => {
        expect(resolveLocalized({ en: 'Jonny', ru: 'Ваня' }, 'de')).toBe('Jonny');
    });

    test('resolves a structured { value, unit } value', () => {
        expect(resolveLocalized({ value: 70, unit: 'kg' }, 'en')).toBe(70);
        expect(resolveLocalized({ value: { en: 'Jonny', ru: 'Ваня' }, unit: null }, 'ru')).toBe('Ваня');
    });
});

describe('hasOtherTranslations', () => {
    test('true when a real translation exists', () => {
        expect(hasOtherTranslations({ lang: 'ru', en: 'island' })).toBe(true);
    });

    test('false when only the lang key exists', () => {
        expect(hasOtherTranslations({ lang: 'ru' })).toBe(false);
    });

    test('false for null/undefined', () => {
        expect(hasOtherTranslations(null)).toBe(false);
        expect(hasOtherTranslations(undefined)).toBe(false);
    });
});

describe('makeTranslationsMap', () => {
    test('sets the text for a locale preserving existing entries', () => {
        const map = makeTranslationsMap('island', 'en', { lang: 'ru' });
        expect(map).toEqual({ lang: 'ru', en: 'island' });
    });

    test('removes the entry when text is empty', () => {
        const map = makeTranslationsMap('', 'en', { lang: 'ru', en: 'island' });
        expect(map).toEqual({ lang: 'ru' });
    });
});

describe('objectName / objectDescription', () => {
    test('resolves name from translations', () => {
        const obj = { name: 'остров', name_translations: { lang: 'ru', en: 'island' } };
        expect(objectName(obj, 'en')).toBe('island');
        expect(objectName(obj, 'ru')).toBe('остров');
    });

    test('falls back to the scalar name', () => {
        expect(objectName({ name: 'Plain' }, 'en')).toBe('Plain');
        expect(objectName(null, 'en')).toBe('');
    });

    test('resolves description from translations', () => {
        const obj = { description: 'описание', description_translations: { lang: 'ru', en: 'description' } };
        expect(objectDescription(obj, 'en')).toBe('description');
    });
});

describe('changeSourceLang (re-tag the plain value, keeping the text)', () => {
    test('no-op when the language is unchanged', () => {
        const r = changeSourceLang({
            plain: 'остров', translations: { en: 'island' }, oldLang: 'ru', newLang: 'ru',
        });
        expect(r.plain).toBe('остров');
        expect(r.translations).toEqual({ en: 'island' });
    });

    test('only re-tags when no translation exists for the new language', () => {
        const r = changeSourceLang({
            plain: 'остров', translations: { en: 'island' }, oldLang: 'ru', newLang: 'de',
        });
        expect(r.plain).toBe('остров');
        expect(r.translations).toEqual({ en: 'island' });
    });

    test('promotes an existing translation and moves the old plain into translations', () => {
        const r = changeSourceLang({
            plain: 'остров', translations: { en: 'island' }, oldLang: 'ru', newLang: 'en',
        });
        expect(r.plain).toBe('island');
        expect(r.translations).toEqual({ ru: 'остров' });
    });

    test('promotion does not create an empty entry for an empty old plain', () => {
        const r = changeSourceLang({
            plain: '', translations: { en: 'island' }, oldLang: 'ru', newLang: 'en',
        });
        expect(r.plain).toBe('island');
        expect(r.translations).toEqual({});
    });

    test('empty newLang is a no-op', () => {
        const r = changeSourceLang({
            plain: 'остров', translations: {}, oldLang: 'ru', newLang: '',
        });
        expect(r.plain).toBe('остров');
    });
});

describe('flattenSearchable', () => {
    test('collects name, description, all translations and property values, skipping lang keys', () => {
        const obj = {
            name: 'остров',
            description: 'описание',
            name_translations: { lang: 'ru', en: 'island', de: 'Insel' },
            description_translations: { lang: 'ru', en: 'a small island' },
            data: {
                properties: {
                    'prop-1': 'телефон',
                    'prop-2': { en: 'Jonny', ru: 'Ваня' },
                    'prop-3': { value: 70, unit: 'kg' },
                },
            },
        };
        const flat = flattenSearchable(obj);
        expect(flat).toEqual([
            'остров',
            'описание',
            'island',
            'Insel',
            'a small island',
            'телефон',
            'Jonny',
            'Ваня',
            '70',
            'kg',
        ]);
    });

    test('returns [] for empty object', () => {
        expect(flattenSearchable(null)).toEqual([]);
        expect(flattenSearchable({})).toEqual([]);
    });
});
