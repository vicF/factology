<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

class AddPrimaryInExternalLinks extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Check if the table exists and the column exists
        if (Schema::hasTable('external_links') && Schema::hasColumn('external_links', 'id')) {

            // Option 1: If the column already exists and just needs to be set as primary
            // First, ensure any NULL values are handled
            DB::table('external_links')
                ->whereNull('id')
                ->update(['id' => DB::raw('UUID()')]);

            // Then alter the column to be primary
            try {
                Schema::table('external_links', function (Blueprint $table) {
                    $table->uuid('id')->primary()->change();
                });
            } catch (\Exception $e) {
                // If change fails, try dropping and recreating the column
                // Only do this if you're sure about the data
                if (str_contains($e->getMessage(), 'Doctrine')) {
                    // Use raw SQL as fallback
                    DB::statement('ALTER TABLE `external_links` MODIFY `id` CHAR(36) NOT NULL');
                    DB::statement('ALTER TABLE `external_links` DROP PRIMARY KEY, ADD PRIMARY KEY (`id`)');
                } else {
                    throw $e;
                }
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
        // Remove primary key and revert column type if needed
        if (Schema::hasTable('external_links')) {
            try {
                Schema::table('external_links', function (Blueprint $table) {
                    $table->dropPrimary(['id']);
                });
            } catch (\Exception $e) {
                // Primary key might not exist
            }
        }
    }
}
