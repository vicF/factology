<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddExifDateToPhotoMedia extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('photo_media', function (Blueprint $table) {
            $table->decimal('exif_date', 28, 0)
                ->after('crc')
                ->comment('Date when digital image was created. ')
                ->nullable(true); // This is temporary just to fill up with data

        });
        Schema::table('photo_media', static function (Blueprint $table) {
            $table->decimal('event_date', 28, 0)
                ->after('crc')
                ->comment('Deprecated!!!. "Start" of media object is used for event date. ')
                ->nullable(false)
                ->change();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('photo_media', static function (Blueprint $table) {
            $table->dropColumn('exif_date');
        });
        Schema::table('photo_media', static function (Blueprint $table) {
            $table->decimal('event_date', 28, 0)
                ->after('crc')
                ->comment('Used for sorting in time. Date of event displayed on photo. May differ from date when digital image was created. ')
                ->nullable(false)
                ->change();
        });
    }
}
