<?php

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class FillThingId extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up() {
        db::transaction(function () {
            DB::table('users')->where('id', 1)->update(['thing_id' => UUID::VICTOR_FOKIN]);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down() {

    }
}
