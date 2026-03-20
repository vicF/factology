<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

class RemoveEnum7RenameColumn extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Check if both columns exist before renaming
        if (Schema::hasColumn('things', 'general_type') && !Schema::hasColumn('things', 'type')) {
            Schema::table('things', static function (Blueprint $table) {
                $table->renameColumn('general_type', 'type');
            });
        }
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        // Check if both columns exist before renaming back
        if (Schema::hasColumn('things', 'type') && !Schema::hasColumn('things', 'general_type')) {
            Schema::table('things', static function (Blueprint $table) {
                $table->renameColumn('type', 'general_type');
            });
        }
    }
}
