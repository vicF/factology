<?php

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddPublic extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('things', static function (Blueprint $table) {
            $table->boolean('public')->default(false)->comment('If true it can be read by anybody');
        });
        Schema::table('links', static function (Blueprint $table) {
            $table->boolean('public')->default(false)->comment('If true it can be read by anybody');
        });
        DB::table('things')->whereIn('thing_id',
            [UUID::ANYTHING, UUID::LINK, UUID::SOMETHING, UUID::LINK_TO_CLASS, UUID::LINK_TO_PARENT])->update(['public' => true]);
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('things', static function (Blueprint $table) {
            $table->dropColumn('public');
        });
        Schema::table('links', static function (Blueprint $table) {
            $table->dropColumn('public');
        });
    }
}