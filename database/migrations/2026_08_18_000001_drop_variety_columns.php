<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Legacy start_variety/end_variety (things) and link_start_variety/link_end_variety
 * (links) columns encoded an uncertainty margin as an opaque number (see the old
 * Everything::echoDateWithVariety thresholds). The flexible-date meta now carries
 * this structured as meta.fuzz: { value, unit }.
 *
 * 1. Decode any non-zero variety values into start_meta/end_meta.fuzz (merging
 *    with whatever the meta already holds).
 * 2. Drop the four columns.
 *
 * The decode mirrors echoDateWithVariety:
 *   < 10000              → no margin
 *   < 240000             → ±1 hour
 *   < 31000000           → ±1 day
 *   <= 10000000000       → ±1 year
 *   else                 → ±floor(value / 10^10) years
 */
return new class extends Migration
{
    private static function decodeVariety($value): ?array
    {
        $value = (float) $value;
        if ($value <= 0 || $value < 10000) {
            return null;
        }
        if ($value < 240000) {
            return ['value' => 1, 'unit' => 'hour'];
        }
        if ($value < 31000000) {
            return ['value' => 1, 'unit' => 'day'];
        }
        if ($value <= 10000000000) {
            return ['value' => 1, 'unit' => 'year'];
        }
        return ['value' => (int) floor($value / 10000000000), 'unit' => 'year'];
    }

    private static function migrateTable(string $table, string $valueColumn, string $metaColumn): void
    {
        if (!Schema::hasColumn($table, $valueColumn) || !Schema::hasColumn($table, $metaColumn)) {
            return;
        }
        $idColumn = $table === 'things' ? 'thing_id' : 'link_id';
        $rows = DB::table($table)
            ->whereNotNull($valueColumn)
            ->where($valueColumn, '>', 0)
            ->get([$idColumn, $valueColumn, $metaColumn]);

        foreach ($rows as $row) {
            $fuzz = self::decodeVariety($row->{$valueColumn});
            if ($fuzz === null) {
                continue;
            }
            $id = $row->{$idColumn};
            $meta = json_decode($row->{$metaColumn} ?? '{}', true);
            $meta = is_array($meta) ? $meta : [];
            $meta['fuzz'] = $fuzz;
            DB::table($table)->where($idColumn, $id)->update([$metaColumn => json_encode($meta)]);
        }
    }

    public function up(): void
    {
        self::migrateTable('things', 'start_variety', 'start_meta');
        self::migrateTable('things', 'end_variety', 'end_meta');
        self::migrateTable('links', 'link_start_variety', 'link_start_meta');
        self::migrateTable('links', 'link_end_variety', 'link_end_meta');

        if (Schema::hasColumn('things', 'start_variety')) {
            Schema::table('things', static function (Blueprint $table) {
                $table->dropColumn(['start_variety', 'end_variety']);
            });
        }
        if (Schema::hasColumn('links', 'link_start_variety')) {
            Schema::table('links', static function (Blueprint $table) {
                $table->dropColumn(['link_start_variety', 'link_end_variety']);
            });
        }
    }

    public function down(): void
    {
        Schema::table('things', static function (Blueprint $table) {
            $table->double('start_variety')->nullable();
            $table->double('end_variety')->nullable();
        });
        Schema::table('links', static function (Blueprint $table) {
            $table->decimal('link_start_variety', 10, 0)->nullable();
            $table->decimal('link_end_variety', 10, 0)->nullable();
        });
    }
};
