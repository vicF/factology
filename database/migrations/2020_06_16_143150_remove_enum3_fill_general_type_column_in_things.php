<?php

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Migrations\Migration;

class RemoveEnum3FillGeneralTypeColumnInThings extends Migration
{

    public function __construct()
    {
        DB::connection()->getDoctrineSchemaManager()->getDatabasePlatform()->registerDoctrineTypeMapping('enum', 'string');
    }

    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
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