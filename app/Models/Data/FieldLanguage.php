<?php
/**
 * FieldLanguage
 * Helpers for the declared language of a plain text field.
 */

namespace Fokin\Facts\Data;

class FieldLanguage
{
    /**
     * Guess the language of a plain text value.
     * Heuristic: text containing Cyrillic characters → 'ru', otherwise → 'en'.
     * Used by the legacy backfill migration and as a save-time default when a
     * client omits the `lang` attribute.
     */
    public static function detect(?string $text): string
    {
        if ($text === null || trim($text) === '') {
            return 'en';
        }
        return preg_match('/[А-Яа-яЁё]/u', $text) ? 'ru' : 'en';
    }
}
