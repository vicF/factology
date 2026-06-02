<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RemoveEnum4ThingsGeneralTypeNotNullable extends Migration
{

    public function __construct()
    {
        if (DB::getDriverName() === 'mysql') {
            DB::connection()->getDoctrineSchemaManager()->getDatabasePlatform()->registerDoctrineTypeMapping('enum', 'string');
        }
    }

    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Skip on PostgreSQL — handled by consolidated migration
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        Schema::table('things', static function (Blueprint $table) {
            $table->smallInteger('general_type')->nullable(false)->change();
        });
        /*DB::table('things')
            ->where('type', 'CLASS')
            ->update(['general_type' => 2]);
        DB::table('things')
            ->where('type', 'GENERAL')
            ->update(['general_type' => 1]);*/

    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('things', static function (Blueprint $table) {
            $table->smallInteger('general_type')->nullable(true)->change();
        });

    }
}