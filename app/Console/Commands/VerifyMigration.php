<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Runs post-import integrity checks on the PostgreSQL database.
 *
 * Usage (inside the container):
 *   php artisan db:verify-migration
 */
class VerifyMigration extends Command
{
    protected $signature = 'db:verify-migration';
    protected $description = 'Print row counts and FK sanity checks after a MySQL → PostgreSQL data import';

    private const TABLES = [
        'things',
        'users',
        'links',
        'classes',
        'general_types',
        'external_links',
        'favourites',
        'history',
        'photo_media',
        'photo_files',
    ];

    public function handle(): int
    {
        $this->info('=== Row counts ===');
        $rows = [];
        foreach (self::TABLES as $table) {
            try {
                $count = DB::table($table)->count();
                $rows[] = [$table, $count];
            } catch (\Throwable $e) {
                $rows[] = [$table, 'ERROR: ' . $e->getMessage()];
            }
        }
        $this->table(['Table', 'Rows'], $rows);

        $this->newLine();
        $this->info('=== FK integrity checks ===');

        $checks = [
            'things.type → general_types.id' => <<<SQL
                SELECT COUNT(*) AS orphans
                FROM things t
                LEFT JOIN general_types gt ON t.type = gt.id
                WHERE gt.id IS NULL
            SQL,
            'links orphaned thing_id' => <<<SQL
                SELECT COUNT(*) AS orphans
                FROM links l
                LEFT JOIN things t ON l.thing_id = t.thing_id
                WHERE t.thing_id IS NULL
            SQL,
            'links orphaned other_id' => <<<SQL
                SELECT COUNT(*) AS orphans
                FROM links l
                LEFT JOIN things t ON l.other_id = t.thing_id
                WHERE t.thing_id IS NULL
            SQL,
            'external_links orphaned thing_id' => <<<SQL
                SELECT COUNT(*) AS orphans
                FROM external_links el
                LEFT JOIN things t ON el.thing_id = t.thing_id
                WHERE t.thing_id IS NULL
            SQL,
            'classes orphaned thing_id' => <<<SQL
                SELECT COUNT(*) AS orphans
                FROM classes c
                LEFT JOIN things t ON c.thing_id = t.thing_id
                WHERE t.thing_id IS NULL
            SQL,
            'users without thing' => <<<SQL
                SELECT COUNT(*) AS orphans
                FROM users u
                LEFT JOIN things t ON u.thing_id = t.thing_id
                WHERE u.thing_id IS NOT NULL AND t.thing_id IS NULL
            SQL,
        ];

        $fkRows = [];
        $allOk = true;
        foreach ($checks as $label => $sql) {
            try {
                $orphans = DB::selectOne($sql)->orphans;
                $status = $orphans == 0 ? 'OK' : "FAIL ({$orphans} orphans)";
                if ($orphans != 0) {
                    $allOk = false;
                }
            } catch (\Throwable $e) {
                $status = 'SKIP: ' . $e->getMessage();
            }
            $fkRows[] = [$label, $status];
        }
        $this->table(['Check', 'Result'], $fkRows);

        $this->newLine();
        $this->info('=== Sample data ===');
        try {
            $sample = DB::table('things')
                ->join('general_types', 'things.type', '=', 'general_types.id')
                ->select('things.thing_id', 'things.name', 'general_types.name as type_name')
                ->limit(5)
                ->get();
            $this->table(['thing_id', 'name', 'type'], $sample->map(fn($r) => [(string)$r->thing_id, $r->name, $r->type_name])->toArray());
        } catch (\Throwable $e) {
            $this->warn('Could not fetch sample: ' . $e->getMessage());
        }

        return $allOk ? 0 : 1;
    }
}
