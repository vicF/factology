// resources/js/localization/languageCatalog.js
//
// Loads the list of languages supported for content translations.
// Languages are THING objects of the "Language" class, each carrying its ISO
// code in `data.lang_code` and a localized display name in name/name_translations.
//
// Falls back to a static [en, ru] list when the catalog is unavailable
// (e.g. fresh client before sync).

import { getDb } from '../localDb/index';
import { objectName } from '../utils/localized.js';

export const DEFAULT_LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'ru', name: 'Русский' },
];

let cache = null;

/**
 * @returns {Promise<Array<{ thing_id: string, code: string, name: string }>>}
 */
export async function loadLanguages() {
    if (cache) return cache;

    let langs = [];
    try {
        const db = getDb();
        langs = await db.objects
            .filter((o) => !o.deleted && o.data?.lang_code)
            .toArray();
    } catch {
        // ignore — fall back to defaults below
    }

    const byCode = new Map();
    for (const t of langs) {
        const code = t.data?.lang_code;
        if (!code) continue;
        if (!byCode.has(code)) {
            byCode.set(code, { thing_id: t.thing_id, code, name: objectName(t) || code });
        }
    }

    cache = Array.from(byCode.values());
    if (cache.length === 0) {
        cache = DEFAULT_LANGUAGES.map((l) => ({ thing_id: null, ...l }));
    }
    return cache;
}

export function clearLanguagesCache() {
    cache = null;
}
