<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

class RemoveEnumCreateGeneralTypesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('general_types', static function (Blueprint $table) {
            $table->smallIncrements('id');
            $table->string('name');
        });

        // Insert the default general types
        /*DB::table('general_types')->insert([
            ['id' => 1, 'name' => 'GENERAL'],
            ['id' => 2, 'name' => 'CLASS'],
            ['id' => 3, 'name' => 'THING'],
            ['id' => 4, 'name' => 'LINK'],
            ['id' => 5, 'name' => 'EXTERNAL'],
        ]);*/
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('general_types');
    }
}
