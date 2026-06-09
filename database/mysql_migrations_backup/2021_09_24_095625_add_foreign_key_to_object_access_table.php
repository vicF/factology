<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddForeignKeyToObjectAccessTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('things_access', function (Blueprint $table) {
            $table->foreign('thing_id')->references('thing_id',)->on('things')->onDelete('cascade');
            $table->foreign('group_id')->references('thing_id',)->on('things')->onDelete('cascade');
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
            $table->dropForeign('thing_id');
            $table->dropForeign('group_id');
        });
    }
}