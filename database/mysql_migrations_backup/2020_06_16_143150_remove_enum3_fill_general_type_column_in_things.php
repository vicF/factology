<?php

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

class RemoveEnum3FillGeneralTypeColumnInThings extends Migration
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

        DB::table('things')->update(['general_type' => DB::raw("`type`")]);
        /*DB::transaction(static function () {
            DB::table('things')->where(['type' => 'GENERAL'])->update(['general_type' => UUID::GENERAL]);
            DB::table('things')->where(['type' => 'CLASS'])->update(['general_type' => UUID::G_CLASS]);
            DB::table('things')->where(['type' => 'THING'])->update(['general_type' => UUID::G_THING]);
            DB::table('things')->where(['type' => 'LINK'])->update(['general_type' => UUID::G_LINK]);
        });*/

    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        DB::table('things')->update(['general_type' => null]);
    }
}