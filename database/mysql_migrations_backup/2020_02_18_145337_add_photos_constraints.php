<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddPhotosConstraints extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up(): void
    {
        Schema::table('photo_media', static function (Blueprint $table) {
            $table->foreign('thing_id', 'photo_media_things_thing_id_foreign')
                ->references('thing_id')
                ->on('things')
                ->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down(): void
    {
        Schema::table('photo_media', static function(Blueprint $table){
            $table->dropForeign('photo_media_things_thing_id_foreign');
        });
    }
}
