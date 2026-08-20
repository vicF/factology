<?php

namespace App\Console\Commands;

use Fokin\Facts\Data\UUID;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Export system objects to the standard database/system-objects.json file.
 *
 * "System objects" are things owned by UUID::SYSTEM_OWNER (the flag set by an
 * admin via the UI). There is no predefined list of UUIDs — ownership by the
 * system is the single source of truth. Both the Postgres DatabaseSeeder and
 * the Dexie seeder read this file as the source of truth for default
 * classes/objects, so anything the runtime needs must be owned by the system.
 */
class ExportSystemObjects extends Command
{
    protected $signature = 'factology:export-system-objects
                            {--path= : Output file (default resources/js/localDb/system-objects.json)}';

    protected $description = 'Export system-owned objects to resources/js/localDb/system-objects.json';

    /**
     * Canonical things columns. Localized names/descriptions are part of the
     * standard schema (2026_08_08_add_localization_columns_to_things) and are
     * included so the export stays a complete source of truth for the seeder.
     */
    private const THING_COLUMNS = [
        'thing_id', 'name', 'type', 'description',
        'name_translations', 'description_translations',
        'start', 'end', 'start_meta', 'end_meta',
        'record_created', 'record_updated', 'owner', 'public', 'deleted', 'data',
        'abstract',
    ];

    /**
     * Canonical links columns (link_id is excluded — it is auto-increment
     * and must be regenerated on fresh installs).
     */
    private const LINK_COLUMNS = [
        'translation', 'one_thing_id', 'link_type_id', 'other_thing_id',
        'public', 'link_start', 'link_end',
        'link_start_meta', 'link_end_meta',
        'link_uuid', 'deleted',
    ];

    public function handle(): int
    {
        // 1. Things: owned by the system (owner = SYSTEM_OWNER), not deleted.
        //    System ownership is the single source of truth — no predefined
        //    UUID list.
        $thingIds = DB::table('things')
            ->where('deleted', false)
            ->where('owner', UUID::SYSTEM_OWNER)
            ->pluck('thing_id')
            ->map(fn($id) => (string) $id)
            ->unique()
            ->values();

        $this->info("Selecting system objects… {$thingIds->count()} things");

        $things = DB::table('things')
            ->whereIn('thing_id', $thingIds)
            ->orderBy('thing_id')
            ->get()
            ->map(function ($thing) {
                $row = array_intersect_key((array) $thing, array_flip(self::THING_COLUMNS));
                // Postgres jsonb columns arrive as strings via PDO; decode them
                // so the export file holds real JSON objects.
                foreach (['data', 'name_translations', 'description_translations', 'start_meta', 'end_meta'] as $col) {
                    if (isset($row[$col]) && is_string($row[$col])) {
                        $row[$col] = json_decode($row[$col]);
                    }
                }
                return $row;
            })
            ->all();

        // 2. Links: both endpoints AND the link type within the exported thing
        //    set — the export must be self-contained so the seeder never
        //    references a link type that is not part of the bootstrap.
        $links = DB::table('links')
            ->where('deleted', false)
            ->whereIn('one_thing_id', $thingIds)
            ->whereIn('other_thing_id', $thingIds)
            ->whereIn('link_type_id', $thingIds)
            ->orderBy('link_id')
            ->get()
            ->map(function ($link) {
                $row = array_intersect_key((array) $link, array_flip(self::LINK_COLUMNS));
                foreach (['link_start_meta', 'link_end_meta'] as $jsonField) {
                    if (is_string($row[$jsonField] ?? null)) {
                        $row[$jsonField] = json_decode($row[$jsonField]);
                    }
                }
                return $row;
            })
            ->all();

        // 3. PHP class mappings for exported things
        $classes = DB::table('classes')
            ->whereIn('thing_id', $thingIds)
            ->orderBy('thing_id')
            ->get()
            ->map(fn($c) => (array) $c)
            ->all();

        // 4. General types (reference data)
        $generalTypes = DB::table('general_types')
            ->orderBy('id')
            ->get()
            ->map(fn($g) => (array) $g)
            ->all();

        $payload = [
            'version'       => 1,
            'scope'         => 'system',
            'exported_at'   => now()->toIso8601String(),
            'general_types' => $generalTypes,
            'data'          => [
                'things'  => $things,
                'links'   => $links,
                'classes' => $classes,
            ],
        ];

        $path = $this->option('path') ?: resource_path('js/localDb/system-objects.json');
        $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if (!is_dir(dirname($path))) {
            mkdir(dirname($path), 0775, true);
        }
        file_put_contents($path, $json . "\n");

        $this->info("→ Wrote " . count($things) . " things, " . count($links) . " links, " . count($classes) . " classes to {$path}");

        return 0;
    }
}
