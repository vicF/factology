<?php

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RemoveEnum1FillGeneralTypesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {

        //DB::connection()->getDoctrineSchemaManager()->getDatabasePlatform()->registerDoctrineTypeMapping('enum', 'string');
        // Skip on PostgreSQL — handled by consolidated migration
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        DB::transaction(static function () {
            DB::table('general_types')->insert(['id' => UUID::GENERAL, 'name' => 'GENERAL']);
            DB::table('general_types')->insert(['id' => UUID::G_CLASS, 'name' => 'CLASS']);
            DB::table('general_types')->insert(['id' => UUID::G_THING, 'name' => 'THING']);
            DB::table('general_types')->insert(['id' => UUID::G_LINK, 'name' => 'LINK']);
        });

    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        // Skip on PostgreSQL — handled by consolidated migration
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        DB::table('general_types')->truncate();
    }
}
