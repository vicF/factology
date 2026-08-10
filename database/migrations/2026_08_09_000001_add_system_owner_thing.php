<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Introduce the reserved "System Owner" thing.
 *
 * Objects owned by SYSTEM_OWNER are "system objects" — they are what the
 * factology:export-system-objects command exports and both seeders (Postgres
 * and Dexie) consume. Public so it is visible to everyone.
 */
return new class extends Migration
{
    public const SYSTEM_OWNER = 'aaaaaaaa-0000-4000-a000-00000000000a';

    public function up(): void
    {
        // Migrations run before the seeder, so make sure the referenced general
        // type exists (things.type has a FK to general_types).
        DB::table('general_types')->upsert(['id' => 1, 'name' => 'GENERAL'], 'id', ['name']);

        if (!DB::table('things')->where('thing_id', self::SYSTEM_OWNER)->exists()) {
            $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

            DB::table('things')->insert([
                'thing_id'       => self::SYSTEM_OWNER,
                'name'           => 'System Owner',
                'description'    => 'System owner — objects owned by it are system objects exported for application setup',
                'type'           => 1, // GENERAL
                'public'         => true,
                'owner'          => self::SYSTEM_OWNER,
                'deleted'        => false,
                'server_uuid'    => $serverUuid,
                'record_created' => now(),
                'record_updated' => now(),
            ]);
        }
    }

    public function down(): void
    {
        DB::table('things')->where('thing_id', self::SYSTEM_OWNER)->delete();
    }
};
