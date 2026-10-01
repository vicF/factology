<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add `visibility` smallint column to the things table.
     *
     * Visibility states:
     *   0 = private  (owner-only)     → public = 0
     *   1 = public   (anyone can see) → public = 1
     *   2 = global (shared catalog rows, e.g. MusicBrainz) → public = 1
     *   3 = group    (reserved, not yet implemented)               → public = 0
     *
     * Backfill: existing public=1 rows get visibility=1, public=0 rows get visibility=0.
     * The `public` column is kept as a derived/materialised cache for auth scopes.
     */
    public function up(): void
    {
        Schema::table('things', function ($table) {
            $table->smallInteger('visibility')->default(0)->after('public');
        });

        // Backfill: cast existing public boolean to visibility smallint
        DB::statement("UPDATE things SET visibility = CAST(public AS integer) WHERE public IS NOT NULL");
        DB::statement("UPDATE things SET visibility = 0 WHERE visibility IS NULL");
    }

    public function down(): void
    {
        Schema::table('things', function ($table) {
            $table->dropColumn('visibility');
        });
    }
};