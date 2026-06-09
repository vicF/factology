<?php

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class LinkUserToObject extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up() {
        //db::transaction(function () {
            Schema::table('users', function (Blueprint $table) {
                $table->uuid('thing_id')->nullable()
                    ->comment('Id of person object')
                    ->foreign('thing_id')->references('thing_id')->on('things');
            });
        //});
        //db::transaction(function () {
            DB::table('users')->where('id', 1)->update(['thing_id' => UUID::VICTOR_FOKIN]);
        //});
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down() {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign('users_thing_id_foreign')->dropColumn('thing_id');
        });
    }
}
