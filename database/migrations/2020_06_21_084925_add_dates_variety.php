<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddDatesVariety extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('links', static function (Blueprint $table) {
            $table->decimal('link_start_variety', 10, 0)
                ->nullable()
                ->after('link_end')
                ->default(null)
                ->comment('Approximate time variety for not certain dates');
            $table->decimal('link_end_variety', 10, 0)
                ->nullable()
                ->after('link_start_variety')
                ->default(null)
                ->comment('Approximate time variety for not certain dates');
        });
        Schema::table('things', static function (Blueprint $table) {
            $table->decimal('start_variety', 10, 0)
                ->nullable()
                ->after('end')
                ->default(null)
                ->comment('Approximate time variety for not certain dates');
            $table->decimal('end_variety', 10, 0)
                ->nullable()
                ->after('start_variety')
                ->default(null)
                ->comment('Approximate time variety for not certain dates');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('links', static function (Blueprint $table) {
            $table->dropColumn('link_start_variety');
            $table->dropColumn('link_end_variety');
        });
        Schema::table('things', static function (Blueprint $table) {
            $table->dropColumn('start_variety');
            $table->dropColumn('end_variety');
        });
    }
}
