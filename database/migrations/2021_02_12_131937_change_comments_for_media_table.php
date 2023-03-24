<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class ChangeCommentsForMediaTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('photo_media', static function (Blueprint $table) {
            $table->decimal('event_date', 28, 0)
                ->comment('Copy of things.start field just for quick search')
                ->change();
            $table->decimal('exif_date', 28, 0)
                ->comment('Exif or file creation date. Used to find similar files. ')
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
            $table->decimal('event_date', 28, 0)
                ->comment('Deprecated!!!. "Start" of media object is used for event date. 	')
                ->change();
            $table->decimal('exif_date', 28, 0)
                ->comment('Date when digital image was created. ')
                ->change();
        });
    }
}
