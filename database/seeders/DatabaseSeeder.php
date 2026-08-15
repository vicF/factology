<?php

namespace Database\Seeders;

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // ============================================================
        // System objects: default classes/objects owned by the system.
        // Single source of truth — resources/js/localDb/system-objects.json,
        // regenerated from the dev database via:
        //   php artisan factology:export-system-objects
        // ============================================================

        // Get current server UUID for provenance tracking
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        $system = $this->loadSystemObjects();

        // General types (reference data)
        foreach ($system['general_types'] as $generalType) {
            DB::table('general_types')->upsert($generalType, 'id', ['name']);
        }

        // Bootstrap things + default classes + system-owned objects.
        // Upsert by thing_id so reruns converge with the file.
        foreach ($system['things'] as $thing) {
            // The export stores the `data` JSON column decoded; re-encode it for
            // the query builder (which does not auto-cast arrays to JSON).
            if (is_array($thing['data'] ?? null)) {
                $thing['data'] = json_encode($thing['data']);
            }
            DB::table('things')->upsert(
                array_merge($thing, ['server_uuid' => $serverUuid]),
                ['thing_id'],
                [
                    'name', 'description', 'type', 'public', 'deleted',
                    'owner', 'start', 'end', 'start_variety', 'end_variety',
                    'data', 'server_uuid', 'abstract',
                ]
            );
        }

        // Class hierarchy + membership links (stable link_uuid as the upsert key).
        foreach ($system['links'] as $link) {
            unset($link['link_id']); // let fresh installs auto-increment link_id
            DB::table('links')->upsert(
                $link,
                ['link_uuid'],
                [
                    'one_thing_id', 'link_type_id', 'other_thing_id',
                    'translation', 'public', 'deleted',
                    'link_start', 'link_end', 'link_start_variety', 'link_end_variety',
                ]
            );
        }

        // PHP class mappings (things backed by a PHP model, e.g. Media)
        foreach ($system['classes'] as $class) {
            DB::table('classes')->upsert($class, 'thing_id', ['class_name']);
        }

        // ============================================================
        // Runtime, per-install wiring (not system objects)
        // ============================================================

        // Link any existing server things to the Server class
        $servers = DB::table('things')->where('type', UUID::G_SERVER)->get();
        foreach ($servers as $server) {
            $alreadyLinked = DB::table('links')
                ->where('one_thing_id', $server->thing_id)
                ->where('link_type_id', UUID::LINK_TO_CLASS)
                ->exists();

            if (!$alreadyLinked) {
                DB::table('links')->insert([
                    'one_thing_id'   => $server->thing_id,
                    'link_type_id'   => UUID::LINK_TO_CLASS,
                    'other_thing_id' => UUID::G_SERVER_CLASS,
                    'translation'    => $server->name . ' is of class Server',
                ]);
            }
        }

        // ============================================================
        // Environment-specific seeders
        // ============================================================
        if (app()->environment('testing')) {
            $this->call(TestDatabaseSeeder::class);
        }

        // Seed legal documents (placeholder content — admin must replace)
        $this->call(LegalDocumentSeeder::class);

        // Seed localization system objects (Property/Language classes + languages)
        $this->call(LocalizationSeeder::class);
    }

    /**
     * Load the system-objects export (resources/js/localDb/system-objects.json).
     *
     * @return array{general_types: array, things: array, links: array, classes: array}
     */
    private function loadSystemObjects(): array
    {
        $path = resource_path('js/localDb/system-objects.json');
        if (!is_file($path)) {
            throw new \RuntimeException(
                "Missing {$path}. Generate it from the dev database: php artisan factology:export-system-objects"
            );
        }

        $export = json_decode(file_get_contents($path), true);
        if (!is_array($export) || !isset($export['data'])) {
            throw new \RuntimeException("Invalid system objects export at {$path}");
        }

        return [
            'general_types' => $export['general_types'] ?? [],
            'things'        => $export['data']['things'] ?? [],
            'links'         => $export['data']['links'] ?? [],
            'classes'       => $export['data']['classes'] ?? [],
        ];
    }
}
