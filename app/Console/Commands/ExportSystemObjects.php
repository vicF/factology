<?php

namespace App\Console\Commands;

use Fokin\Facts\Data\UUID;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Export system objects to the standard database/system-objects.json file.
 *
 * "System objects" are things owned by UUID::SYSTEM_OWNER (the flag set by an
 * admin via the UI) plus the reserved bootstrap UUIDs every installation needs.
 * Both the Postgres DatabaseSeeder and the Dexie seeder read this file as the
 * single source of truth for default classes/objects.
 */
class ExportSystemObjects extends Command
{
    protected $signature = 'factology:export-system-objects
                            {--path= : Output file (default resources/js/localDb/system-objects.json)}';

    protected $description = 'Export system-owned objects to resources/js/localDb/system-objects.json';

    /**
     * Reserved bootstrap UUIDs — always exported regardless of owner.
     */
    private const RESERVED_UUIDS = [
        UUID::EVERYTHING,
        UUID::LINK,
        UUID::LINK_TO_PARENT,
        UUID::LINK_TO_CLASS,
        UUID::SOMETHING,
        UUID::USER,
        UUID::SYSTEM,
        UUID::VICTOR_FOKIN,
        UUID::GROUP_READ_ACCESS,
        UUID::BELONGS_TO_USER_GROUP,
        UUID::SYSTEM_OWNER,
        // Abstract base link types (link taxonomy grouping containers)
        '733112a1-9e87-47ee-8a86-81cc38e77a41', // Kind
        '79762fd7-e52d-4401-8010-fda9a7e81aa0', // Containment
        '16414472-da4b-427d-8886-b7c75d133750', // Equivalence
        '1858e752-8df2-43ef-86c3-0d3581e522a8', // Time
        '41211efa-61fd-422d-b07f-7041289bc8aa', // followed by
    ];

    /**
     * Canonical things columns. The live dev DB may carry extra columns
     * (e.g. name_translations) that are not part of the standard schema —
     * the standard export only includes these.
     */
    private const THING_COLUMNS = [
        'thing_id', 'name', 'type', 'description',
        'start', 'end', 'start_meta', 'end_meta', 'start_variety', 'end_variety',
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
        'link_start_variety', 'link_end_variety', 'link_uuid', 'deleted',
    ];

    public function handle(): int
    {
        // 1. Things: reserved bootstrap UUIDs ∪ owner = SYSTEM_OWNER, not deleted
        $thingIds = DB::table('things')
            ->where('deleted', false)
            ->where(function ($q) {
                $q->whereIn('thing_id', self::RESERVED_UUIDS)
                  ->orWhere('owner', UUID::SYSTEM_OWNER);
            })
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
                foreach (['data', 'start_meta', 'end_meta'] as $jsonField) {
                    if (is_string($row[$jsonField] ?? null)) {
                        $row[$jsonField] = json_decode($row[$jsonField]);
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
