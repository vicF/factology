<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Search performance indexes for the object search.
     *
     * Text search on the main page and in object pickers was a sequential scan
     * over the whole `things` table: `ILIKE '%term%'` (and the jsonb translation
     * EXISTS checks) cannot use a btree index. This migration:
     *
     *  1. enables pg_trgm (GIN trigram indexes serve leading-wildcard ILIKE);
     *  2. adds generated `name_search_text` / `description_search_text` columns
     *     holding every translation value except the reserved "lang" metadata
     *     key (the "lang" value must stay non-searchable), so translation
     *     search is a plain column ILIKE and can use a trigram index too;
     *  3. builds the GIN indexes.
     */
    public function up(): void
    {
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        // Concatenates the translation values, excluding the reserved "lang"
        // metadata key. Immutable so it can feed generated columns.
        DB::statement(<<<'SQL'
            CREATE OR REPLACE FUNCTION jsonb_values_except_lang(j jsonb)
            RETURNS text
            LANGUAGE sql
            IMMUTABLE
            PARALLEL SAFE
            AS $$
                SELECT string_agg(e.value, ' ')
                FROM jsonb_each_text(j) AS e
                WHERE e.key <> 'lang'
            $$
        SQL);

        if (!Schema::hasColumn('things', 'name_search_text')) {
            DB::statement('ALTER TABLE things ADD COLUMN name_search_text text GENERATED ALWAYS AS (jsonb_values_except_lang(name_translations)) STORED');
        }
        if (!Schema::hasColumn('things', 'description_search_text')) {
            DB::statement('ALTER TABLE things ADD COLUMN description_search_text text GENERATED ALWAYS AS (jsonb_values_except_lang(description_translations)) STORED');
        }

        DB::statement('CREATE INDEX IF NOT EXISTS things_name_trgm_idx ON things USING gin (name gin_trgm_ops)');
        DB::statement('CREATE INDEX IF NOT EXISTS things_description_trgm_idx ON things USING gin (description gin_trgm_ops)');
        DB::statement('CREATE INDEX IF NOT EXISTS things_name_search_text_trgm_idx ON things USING gin (name_search_text gin_trgm_ops)');
        DB::statement('CREATE INDEX IF NOT EXISTS things_description_search_text_trgm_idx ON things USING gin (description_search_text gin_trgm_ops)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS things_description_search_text_trgm_idx');
        DB::statement('DROP INDEX IF EXISTS things_name_search_text_trgm_idx');
        DB::statement('DROP INDEX IF EXISTS things_description_trgm_idx');
        DB::statement('DROP INDEX IF EXISTS things_name_trgm_idx');

        if (Schema::hasColumn('things', 'name_search_text')) {
            DB::statement('ALTER TABLE things DROP COLUMN name_search_text');
        }
        if (Schema::hasColumn('things', 'description_search_text')) {
            DB::statement('ALTER TABLE things DROP COLUMN description_search_text');
        }
        DB::statement('DROP FUNCTION IF EXISTS jsonb_values_except_lang(jsonb)');
    }
};
