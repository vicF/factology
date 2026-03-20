<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
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
        // Remove the Doctrine DBAL line - it's not needed for adding a new column
        // DB::connection()->getDoctrineSchemaManager()->getDatabasePlatform()->registerDoctrineTypeMapping('enum', 'string');

        try {
            Schema::table('things', static function (Blueprint $table) {
                $table->smallInteger('general_type')->after('type')->nullable();
            });
        } catch (\Illuminate\Database\QueryException $e) {
            // Column already exists (error code 42S21 means duplicate column)
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
