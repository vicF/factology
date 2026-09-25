<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add indexes that speed up object opening queries.
     *
     * When an object is opened, we query:
     *   things:  WHERE thing_id = ? [PK: covered]
     *            WHERE public = ? AND owner = ? AND deleted = ?  [indexed: owner + deleted]
     *   links:   WHERE one_thing_id = ? AND link_type_id = ? AND deleted = ?  [indexed: one_thing_id + link_type_id + deleted]
     *   external_links: WHERE thing_id = ?  [indexed: thing_id]
     */
    public function up(): void
    {
        // things — auth / visibility filtering
        DB::statement('CREATE INDEX IF NOT EXISTS things_owner_deleted_idx ON things (owner, deleted)');

        // links — opening from the "one" side, common queries filter by link_type and deleted
        DB::statement('CREATE INDEX IF NOT EXISTS links_one_thing_id_deleted_idx ON links (one_thing_id, link_type_id, deleted)');

        // external_links — every object open queries WHERE thing_id = ?
        DB::statement('CREATE INDEX IF NOT EXISTS external_links_thing_id_idx ON external_links (thing_id)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS external_links_thing_id_idx');
        DB::statement('DROP INDEX IF EXISTS links_one_thing_id_deleted_idx');
        DB::statement('DROP INDEX IF EXISTS things_owner_deleted_idx');
    }
};