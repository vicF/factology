<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class UpdatePhotosStructure extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('photo_files', static function (Blueprint $table) {
            $table->uuid('folder_id')
                ->after('crc')
                ->comment('Links to folder containing this path')
                ->nullable(false);

        });
        Schema::table('photo_media', static function (Blueprint $table) {
            $table->dateTime('event_date')
                ->after('crc')
                ->comment('Used for sorting in time. Date of event displayed on photo. May differ from date when digital image was created. ')
                ->nullable(false);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        try {
            Schema::table('photo_files', static function (Blueprint $table) {
                $table->dropColumn('folder_id');
            });
            Schema::table('photo_media', static function (Blueprint $table) {
                $table->dropColumn('event_date');
            });
        } catch(\Throwable $e) {}
    }
}
