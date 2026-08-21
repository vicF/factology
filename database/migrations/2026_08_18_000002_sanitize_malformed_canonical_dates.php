<?php

use Fokin\Facts\Data\FlexibleDate;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Re-encode malformed canonical date values. Some legacy huge-BC years (e.g.
 * Universe "~13.8 bn years ago") were stored with an invalid 24:60:60 time
 * tail, which read back as garbage ("-1:-1:-1"). FlexibleDate::sanitizeCanonical
 * re-encodes any such value into its correct padded canonical form (year
 * precision, Jan 1, inverted midnight for BC). Idempotent: valid values pass
 * through unchanged, so re-running converges to no-ops.
 */
return new class extends Migration
{
    private static function sanitizeTable(string $table, string $dateColumn): void
    {
        $rows = DB::table($table)->whereNotNull($dateColumn)->get([$table === 'things' ? 'thing_id' : 'link_id', $dateColumn]);
        $idColumn = $table === 'things' ? 'thing_id' : 'link_id';
        foreach ($rows as $row) {
            $fixed = FlexibleDate::sanitizeCanonical((string) $row->{$dateColumn});
            if ($fixed !== null && $fixed !== $row->{$dateColumn}) {
                DB::table($table)->where($idColumn, $row->{$idColumn})->update([$dateColumn => $fixed]);
            }
        }
    }

    public function up(): void
    {
        self::sanitizeTable('things', 'start');
        self::sanitizeTable('things', 'end');
        self::sanitizeTable('links', 'link_start');
        self::sanitizeTable('links', 'link_end');
    }

    public function down(): void
    {
        // Data correction — no meaningful rollback.
    }
};
