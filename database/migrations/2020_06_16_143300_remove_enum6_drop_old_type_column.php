<?php

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

class RemoveEnum6DropOldTypeColumn extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Check if the 'type' column exists before trying to drop it
        if (Schema::hasColumn('things', 'type')) {
            Schema::table('things', static function (Blueprint $table) {
                $table->dropColumn('type');
            });
        }
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        // First, check if the 'type' column doesn't already exist
        if (!Schema::hasColumn('things', 'type')) {
            // Add back the enum column
            Schema::table('things', static function (Blueprint $table) {
                $table->enum('type', ['GENERAL', 'LINK', 'CLASS', 'THING'])
                    ->after('name')
                    ->comment('Defines few global types of objects like thing, link, class')
                    ->default('GENERAL')
                    ->nullable(true);
            });
        }

        // Restore the data from general_type back to type
        if (Schema::hasColumn('things', 'general_type') && Schema::hasColumn('things', 'type')) {
            DB::transaction(static function () {
                DB::table('things')->where(['general_type' => UUID::GENERAL])->update(['type' => 'GENERAL']);
                DB::table('things')->where(['general_type' => UUID::G_CLASS])->update(['type' => 'CLASS']);
                DB::table('things')->where(['general_type' => UUID::G_THING])->update(['type' => 'THING']);
                DB::table('things')->where(['general_type' => UUID::G_LINK])->update(['type' => 'LINK']);
            });
        }

        /* Original commented code - kept for reference
        Schema::table('things', static function (Blueprint $table) {
            $table->enum('type', ['GENERAL', 'LINK', 'CLASS', 'THING'])
                ->nullable(false)->change();
        });
        */
    }
}
