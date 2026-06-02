<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RemoveEnum2AddGeneralTypeColumn extends Migration
{
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

        DB::connection()->getDoctrineSchemaManager()->getDatabasePlatform()->registerDoctrineTypeMapping('enum', 'string');
        try {
            Schema::table('things', static function (Blueprint $table) {
                $table->smallInteger('general_type')->after('type');
            });
        } catch (\Illuminate\Database\QueryException $e) {
            if ($e->getCode() !== '42S21') {
                throw $e;
            }
        }

    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('things', static function (Blueprint $table) {
            $table->dropColumn('general_type');
        });
    }
}
