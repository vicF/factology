<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class SetPublicForAllLinks extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('links', static function ($table) {
            $table->boolean('public')->default(true)->comment('Links are public by default. But it works only if things are public')->change();
        });
        DB::table('links')->update(['public' => 1]);
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('links', static function ($table) {
            $table->boolean('public')->default(false)->comment('If true it can be read by anybody')->change();
        });
    }
}
