<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Reset all PostgreSQL sequences after data migration from MySQL.
 *
 * When pgloader (or manual INSERT) populates tables with explicit
 * primary key values, the underlying sequences are not automatically
 * updated. This causes "duplicate key violates unique constraint"
 * errors when new rows are inserted without specifying an ID.
 */
return new class extends Migration
{
    public function up(): void
    {
        $sequences = DB::select("
            SELECT
                c.table_name,
                c.column_name,
                pg_get_serial_sequence(c.table_name, c.column_name) AS seq_name
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.column_default LIKE 'nextval%'
        ");

        foreach ($sequences as $seq) {
            $maxId = DB::table($seq->table_name)->max($seq->column_name) ?? 0;
            if ($maxId > 0) {
                DB::statement("SELECT setval('{$seq->seq_name}', {$maxId})");
            }
        }
    }

    public function down(): void
    {
        // No rollback — sequence values cannot be meaningfully reverted.
    }
};
