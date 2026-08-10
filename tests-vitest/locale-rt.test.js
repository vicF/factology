// Runtime reproduction: does currentLocale() pick up 'ru' from localStorage at
// module load, and does objectName resolve the Russian translation?
import { vi } from 'vitest';

describe('locale runtime', () => {
    test('currentLocale reflects localStorage at load', async () => {
        localStorage.setItem('locale', 'ru');
        // fresh import so i18n reads localStorage during createI18n
        vi.resetModules();
        const { currentLocale, objectName } = await import('../resources/js/utils/localized.js');
        expect(currentLocale()).toBe('ru');

        const obj = {
            name: "Leningrad Rock'n'Roll in Central Park of Culture and Leisure",
            name_translations: { ru: 'Ленинградский Рок-н-Ролл в ЦПКО', lang: 'en' },
        };
        expect(objectName(obj)).toBe('Ленинградский Рок-н-Ролл в ЦПКО');
        expect(objectName(obj, 'en')).toBe("Leningrad Rock'n'Roll in Central Park of Culture and Leisure");
    });
});
