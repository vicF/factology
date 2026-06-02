<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddTimestamps extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Skip on PostgreSQL – handled by schema already (or not needed)
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        Schema::table('things', static function (Blueprint $table) {
            $table->timestamp('record_created')->default(DB::raw('CURRENT_TIMESTAMP'))
                ->comment('Record creation time');
            $table->timestamp('record_updated')->default(DB::raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'))
                ->comment('Record update time');
            $table->uuid('owner')->default(\Fokin\Facts\Data\UUID::VICTOR_FOKIN);
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        // Skip on PostgreSQL – handled by schema already (or not needed)
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        Schema::table('things', static function (Blueprint $table) {
            $table->dropColumn('record_created');
            $table->dropColumn('record_updated');
            $table->dropColumn('owner');
        });
    }
}
