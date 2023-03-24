<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddPhotosSessAndDeleted extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up(): void
    {
        Schema::table('photo_files', static function (Blueprint $table) {
            $table->integer('last_seen', false, true)->nullable()->default(null);
            $table->boolean('deleted')->default(false);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down(): void
    {
        Schema::table('photo_files', static function (Blueprint $table) {
            $table->dropColumn('last_seen');
            $table->dropColumn('deleted');
        });
    }
}
