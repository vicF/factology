<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Convert app UUID columns from char(36) to the native uuid type.
 *
 * All values were verified to be valid UUIDs before this migration.
 * Precedent: 2026_07_01_000001_change_file_thing_id_to_uuid.php
 */
return new class extends Migration
{
    public function up(): void
    {
        // things.owner — char(36) with a UUID default
        if (Schema::hasTable('things') && Schema::getColumnType('things', 'owner') !== 'uuid') {
            DB::statement('ALTER TABLE things ALTER COLUMN owner DROP DEFAULT');
            DB::statement('ALTER TABLE things ALTER COLUMN owner TYPE uuid USING owner::uuid');
            DB::statement("ALTER TABLE things ALTER COLUMN owner SET DEFAULT '0ac1b13b-acbf-4246-bed4-8f0c2a8b2546'");
        }

        // photo_files.folder_id — char(36) pointing at a service/thing UUID
        if (Schema::hasTable('photo_files') && Schema::getColumnType('photo_files', 'folder_id') !== 'uuid') {
            DB::statement('ALTER TABLE photo_files ALTER COLUMN folder_id TYPE uuid USING folder_id::uuid');
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('things') && Schema::getColumnType('things', 'owner') === 'uuid') {
            DB::statement('ALTER TABLE things ALTER COLUMN owner DROP DEFAULT');
            DB::statement('ALTER TABLE things ALTER COLUMN owner TYPE char(36) USING owner::text');
            DB::statement("ALTER TABLE things ALTER COLUMN owner SET DEFAULT '0ac1b13b-acbf-4246-bed4-8f0c2a8b2546'");
        }

        if (Schema::hasTable('photo_files') && Schema::getColumnType('photo_files', 'folder_id') === 'uuid') {
            DB::statement('ALTER TABLE photo_files ALTER COLUMN folder_id TYPE char(36) USING folder_id::text');
        }
    }
};
