<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddUniqueIndexToPhotoFilesAndRemoveDuplicates extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('photo_files', function (Blueprint $table) {
           $table->unique('file_thing_id');
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
            $table->dropIndex('photo_files_file_thing_id_unique');
        });
    }
}