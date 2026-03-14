<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddSha256ToPhotoMediaTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('photo_media', function (Blueprint $table) {
            $table->char('sha256', 64)
                ->nullable(true)
                ->comment('sha256 hash of file');
            $table->index( ['size','sha256'], 'size_sha_index');
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
            $table->dropColumn('sha256');
        });
    }
}
