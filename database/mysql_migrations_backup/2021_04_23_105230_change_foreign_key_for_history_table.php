<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class ChangeForeignKeyForHistoryTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('history', function (Blueprint $table) {
            $table->dropForeign('history_user_id_foreign');
            $table->foreign('user_id')->references('thing_id')->on('users')->onDelete('cascade');
            $table->dropForeign('history_history_id_foreign');
            $table->foreign('history_id')->references('thing_id')->on('things')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('history', function (Blueprint $table) {
            $table->dropForeign('history_user_id_foreign');
            $table->foreign('user_id')->references('thing_id')->on('users');
            $table->dropForeign('history_history_id_foreign');
            $table->foreign('history_id')->references('thing_id')->on('things');
        });
    }
}