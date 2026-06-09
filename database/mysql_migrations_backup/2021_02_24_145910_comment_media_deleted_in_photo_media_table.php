<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CommentMediaDeletedInPhotoMediaTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('photo_media', function (Blueprint $table) {
            $table->boolean('media_deleted')->comment('Copy of things.deleted. Some media that was added by mistake')->change();
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
            $table->boolean('media_deleted')->comment('')->change();
        });
    }
}
