<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

class ChangeVarietyTypeInThings extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Use raw SQL to avoid Doctrine DBAL and handle NULLs gracefully
        DB::statement('ALTER TABLE `things` MODIFY `start_variety` FLOAT NULL');
        DB::statement('ALTER TABLE `things` MODIFY `end_variety` FLOAT NULL');
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        DB::statement('ALTER TABLE `things` MODIFY `start_variety` DECIMAL(10, 0) NULL');
        DB::statement('ALTER TABLE `things` MODIFY `end_variety` DECIMAL(10, 0) NULL');
    }
}
