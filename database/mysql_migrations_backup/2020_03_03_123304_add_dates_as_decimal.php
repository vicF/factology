<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AddDatesAsDecimal extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Skip on PostgreSQL – handled by schema already (or not needed)
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        Schema::table('photo_media', static function (Blueprint $table) {
            DB::Statement('ALTER TABLE `photo_media` MODIFY `event_date` DECIMAL(28) NOT NULL;');
        });
        Schema::table('things', static function (Blueprint $table) {
            DB::Statement('ALTER TABLE `things` MODIFY `start` DECIMAL(28) NULL;');
        });
        Schema::table('things', static function (Blueprint $table) {
            DB::Statement('ALTER TABLE `things` MODIFY `end` DECIMAL(28)  NULL;');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        // Skip on PostgreSQL – handled by schema already (or not needed)
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        Schema::table('photo_media', static function (Blueprint $table) {
            DB::Statement('ALTER TABLE `photo_media` MODIFY `event_date` datetime NOT NULL;');
        });
        Schema::table('things', static function (Blueprint $table) {
            DB::Statement('ALTER TABLE `things` MODIFY `start` datetime NULL;');
        });
        Schema::table('things', static function (Blueprint $table) {
            DB::Statement('ALTER TABLE `things` MODIFY `end` datetime  NULL;');
        });
    }
}
