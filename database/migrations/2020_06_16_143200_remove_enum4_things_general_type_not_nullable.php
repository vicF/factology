<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

class RemoveEnum4ThingsGeneralTypeNotNullable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // First, ensure any NULL values are populated with a default
        // before making the column NOT NULL
        if (Schema::hasColumn('things', 'general_type')) {
            // Set any NULL values to a default (e.g., GENERAL type = 1)
            DB::table('things')
                ->whereNull('general_type')
                ->update(['general_type' => 1]);
        }

        // Now make the column NOT NULL
        Schema::table('things', static function (Blueprint $table) {
            $table->smallInteger('general_type')->nullable(false)->change();
        });

        /* Original commented code - kept for reference
        DB::table('things')
            ->where('type', 'CLASS')
            ->update(['general_type' => 2]);
        DB::table('things')
            ->where('type', 'GENERAL')
            ->update(['general_type' => 1]);
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
            Schema::table('things', static function (Blueprint $table) {
                $table->smallInteger('general_type')->nullable(true)->change();
            });
        }
    }
}
