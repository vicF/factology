<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class ChangeCommentToExifDateInPhotoMediaTable extends Migration
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
                ->comment('Exif date or earliest known file creation date. Used to find similar files. ')
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
        Schema::table('photo_media', function (Blueprint $table) {
            $table->decimal('exif_date', 28, 0)
                ->comment('Exif or file creation date. Used to find similar files. ')
                ->change();
        });
    }
}
