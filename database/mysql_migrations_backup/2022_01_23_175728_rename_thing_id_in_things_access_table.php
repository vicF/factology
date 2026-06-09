<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class RenameThingIdInThingsAccessTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('things_access', function (Blueprint $table) {
            $table->renameColumn('thing_id', 'accessed_thing_id');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('things_access', function (Blueprint $table) {
            $table->renameColumn('accessed_thing_id', 'thing_id');
        });
    }
}