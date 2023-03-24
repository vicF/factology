<?php

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class RemoveEnum6DropOldTypeColumn extends Migration
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
        Schema::table('things', static function (Blueprint $table) {
            $table->dropColumn('type');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        DB::connection()->getDoctrineSchemaManager()->getDatabasePlatform()->registerDoctrineTypeMapping('enum', 'string');
        Schema::table('things', static function (Blueprint $table) {
            $table->enum('type', ['GENERAL', 'LINK', 'CLASS', 'THING'])
                ->after('name')
                ->comment('Defines few global types of objects like thing, link, class')
                ->default('GENERAL')
                ->nullable(true);
        });
        DB::transaction(static function () {
            DB::table('things')->where(['general_type' => UUID::GENERAL])->update(['type' => 'GENERAL']);
            DB::table('things')->where(['general_type' => UUID::G_CLASS])->update(['type' => 'CLASS']);
            DB::table('things')->where(['general_type' => UUID::G_THING])->update(['type' => 'THING']);
            DB::table('things')->where(['general_type' => UUID::G_LINK])->update(['type' => 'LINK']);
        });
        /*Schema::table('things', static function (Blueprint $table) {
            $table->enum('type', ['GENERAL', 'LINK', 'CLASS', 'THING'])
                ->nullable(false)->change();
        });*/
    }
}