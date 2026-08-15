<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // The link type UUID::PRESENT was displayed as "features", which in English
        // reads container→participant ("the movie features an actor") — the opposite
        // of the intended semantics. Rename it to "is involved in" (participant →
        // process) and give it a Russian translation.
        DB::table('things')
            ->where('thing_id', '8811c270-4285-4534-bb2a-c4da1ba850e4')
            ->update([
                'name'              => 'is involved in',
                'name_translations' => json_encode(['lang' => 'en', 'ru' => 'участвует в']),
            ]);

        // Deduplicate reversed pairs FIRST (before any direction swap): for each
        // (one, other, type) ↔ (other, one, type) pair keep the lower link_id (the
        // older row), delete the newer one. Must run before the flip below — an
        // in-place swap of a reversed pair would otherwise momentarily collide on
        // links_unique_combination.
        DB::statement(
            'DELETE FROM links a USING links b
             WHERE a.one_thing_id = b.other_thing_id
               AND a.other_thing_id = b.one_thing_id
               AND a.link_type_id = b.link_type_id
               AND a.link_id > b.link_id
               AND a.deleted = false AND b.deleted = false'
        );

        // Normalize PRESENT links to participant-first (participant → process), e.g.
        // "Поездка в Сосновый Бор → features → Виктор" becomes
        // "Виктор → is involved in → Поездка в Сосновый Бор".
        // PostgreSQL evaluates all SET expressions against the pre-update row, so the
        // two columns swap cleanly. Safe now that no reversed pairs remain.
        DB::statement(
            "UPDATE links SET one_thing_id = other_thing_id, other_thing_id = one_thing_id
             WHERE link_type_id = '8811c270-4285-4534-bb2a-c4da1ba850e4' AND deleted = false"
        );

        // DB-level guarantee: treat a link's endpoint pair as symmetric — no two live
        // rows may exist between the same pair with the same type, regardless of
        // direction. (Partial index on `deleted = false` so soft-deleted rows don't
        // block re-creating a link.)
        DB::statement('CREATE UNIQUE INDEX links_unique_pair_endpoints
            ON links (
                LEAST(one_thing_id, other_thing_id),
                GREATEST(one_thing_id, other_thing_id),
                link_type_id
            )
            WHERE deleted = false');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS links_unique_pair_endpoints');
    }
};
