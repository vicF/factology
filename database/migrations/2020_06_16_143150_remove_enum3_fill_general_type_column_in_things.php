<?php

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RemoveEnum3FillGeneralTypeColumnInThings extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Check if the general_type column exists before trying to update
        if (Schema::hasColumn('things', 'general_type')) {
            // First, check if we need to convert from enum string values
            // If the 'type' column still exists and has enum values
            if (Schema::hasColumn('things', 'type')) {
                // Map enum string values to their corresponding IDs
                DB::table('things')->update([
                    'general_type' => DB::raw("
                        CASE `type`
                            WHEN 'GENERAL' THEN " . UUID::GENERAL . "
                            WHEN 'CLASS' THEN " . UUID::G_CLASS . "
                            WHEN 'THING' THEN " . UUID::G_THING . "
                            WHEN 'LINK' THEN " . UUID::G_LINK . "
                            WHEN 'EXTERNAL' THEN " . UUID::G_EXTERNAL . "
                            ELSE general_type
                        END
                    ")
                ]);
            } else {
                // If we're in a fresh install or the 'type' column is already gone,
                // we might not need to do anything, or we could set default values
                // based on existing data
            }
        }

        /* Original commented code - kept for reference
        DB::transaction(static function () {
            DB::table('things')->where(['type' => 'GENERAL'])->update(['general_type' => UUID::GENERAL]);
            DB::table('things')->where(['type' => 'CLASS'])->update(['general_type' => UUID::G_CLASS]);
            DB::table('things')->where(['type' => 'THING'])->update(['general_type' => UUID::G_THING]);
            DB::table('things')->where(['type' => 'LINK'])->update(['general_type' => UUID::G_LINK]);
        });
        */
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        if (Schema::hasColumn('things', 'general_type')) {
            DB::table('things')->update(['general_type' => null]);
        }
    }
}
