<?php

use Fokin\Facts\Data\FlexibleDate;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Normalize legacy unpadded date values to the canonical form.
 *
 * The engine (Everything::dateToDb) always right-pads to a 10-digit
 * MMDDHHMMSS tail, but legacy rows (written by the old date field) store raw
 * variable-length digit strings such as '2026081112' (2026-08-11 12:00) or
 * '1967' (year only). Those break chronological numeric sorting next to the
 * padded canonicals, and they cannot be parsed by the canonical read-back rule
 * (`year = length - 10`). Convert each to its padded canonical and record the
 * inferred precision in the meta column so display keeps the original
 * precision (e.g. '2026081112' still renders "12:00", not "12:00:00").
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->normalizeColumn('start', 'start_meta');
        $this->normalizeColumn('end', 'end_meta');
    }

    public function down(): void
    {
        // Data normalization is not reversed automatically.
    }

    private function normalizeColumn(string $column, string $metaColumn): void
    {
        if (!Schema::hasColumn('things', $column) || !Schema::hasColumn('things', $metaColumn)) {
            return;
        }
        // Quote "end" (reserved word) in the raw length predicate.
        $rows = DB::table('things')
            ->whereNotNull($column)
            ->whereRaw('LENGTH("' . $column . '"::text) < 14')
            ->get(['thing_id', $column, $metaColumn]);

        foreach ($rows as $row) {
            $raw = (string) $row->{$column};
            $parsed = FlexibleDate::parse($raw);
            if ($parsed === null || $parsed->value === null || $parsed->value === $raw) {
                continue;
            }
            $update = [$column => $parsed->value];
            if ($row->{$metaColumn} === null) {
                $update[$metaColumn] = json_encode([
                    'qualifier' => 'exact',
                    'era'       => 'gregorian',
                    'precision' => $parsed->precision,
                    'original'  => $raw,
                ], JSON_UNESCAPED_UNICODE);
            }
            DB::table('things')->where('thing_id', $row->thing_id)->update($update);
        }
    }
};
