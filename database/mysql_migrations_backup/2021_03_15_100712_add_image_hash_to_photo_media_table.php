<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddImageHashToPhotoMediaTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Skip on PostgreSQL — handled by consolidated migration
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        Schema::table('photo_media', function (Blueprint $table) {
            $table->char('phash', 16)
                ->charset('binary')
                ->nullable(true)
                ->index()
                ->comment('perceptual hash of image jenssegers/imagehash');
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
            $table->dropColumn('phash');
        });
    }
}
