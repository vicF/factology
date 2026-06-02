<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CommentMediaDeletedInPhotoFilesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('photo_files', function (Blueprint $table) {
            $table->boolean('file_deleted')->comment('This file was physically missing during the last scan')->change();

        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('photo_files', function (Blueprint $table) {
            $table->boolean('file_deleted')->comment('')->change();

        });
    }
}
