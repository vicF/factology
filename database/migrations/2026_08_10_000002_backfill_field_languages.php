<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Backfill the declared language of legacy plain text fields.
     *
     * Before localization, name/description had no language attribute at all
     * (name_translations is NULL for ~168K rows). We backfill the reserved
     * `lang` key using a script heuristic: Cyrillic text → 'ru', else 'en'.
     * Wrong guesses are fixable per-field from the editor's language selector.
     */
    public function up(): void
    {
        DB::statement(<<<'SQL'
            UPDATE things
            SET name_translations = jsonb_build_object(
                'lang', CASE WHEN name ~ '[А-Яа-яЁё]' THEN 'ru' ELSE 'en' END
            )
            WHERE name_translations IS NULL
               OR name_translations = '{}'::jsonb
        SQL);

        DB::statement(<<<'SQL'
            UPDATE things
            SET description_translations = jsonb_build_object(
                'lang', CASE WHEN description ~ '[А-Яа-яЁё]' THEN 'ru' ELSE 'en' END
            )
            WHERE description_translations IS NULL
               OR description_translations = '{}'::jsonb
        SQL);
    }

    public function down(): void
    {
        // Revert only the backfilled rows (exactly {"lang": "en"} / {"lang": "ru"}),
        // leaving any rows that already carried translations untouched.
        DB::statement("UPDATE things SET name_translations = NULL WHERE name_translations = '{\"lang\": \"en\"}'::jsonb OR name_translations = '{\"lang\": \"ru\"}'::jsonb");
        DB::statement("UPDATE things SET description_translations = NULL WHERE description_translations = '{\"lang\": \"en\"}'::jsonb OR description_translations = '{\"lang\": \"ru\"}'::jsonb");
    }
};
