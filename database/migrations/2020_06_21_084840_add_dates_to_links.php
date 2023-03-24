<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddDatesToLinks extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('links', function (Blueprint $table) {
            $table->decimal('link_start', 28,0)
                ->nullable()
                ->default(null)
                ->comment('time when this relation started (if applicable)');
            $table->decimal('link_end', 28,0)
                ->nullable()
                ->default(null)
                ->comment('time when this relation started (if applicable)');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('links', function (Blueprint $table) {
            $table->dropColumn('link_start');
            $table->dropColumn('link_end');
        });
    }
}
