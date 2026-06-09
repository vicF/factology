<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddForeignKeyToLinksAccessTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('links_access', function (Blueprint $table) {
            $table->foreign('link_id')->references('link_id',)->on('links')->onDelete('cascade');
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
        Schema::table('links_access', function (Blueprint $table) {
            //
        });
    }
}