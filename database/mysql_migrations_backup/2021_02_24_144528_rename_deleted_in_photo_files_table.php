<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class RenameDeletedInPhotoFilesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('photo_files', function (Blueprint $table) {
            $table->renameColumn('deleted', 'file_deleted');

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
            $table->renameColumn('file_deleted', 'deleted');
        });
    }
}
