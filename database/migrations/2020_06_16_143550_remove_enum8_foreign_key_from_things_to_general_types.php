<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

class RemoveEnum8ForeignKeyFromThingsToGeneralTypes extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Check if the column exists and doesn't already have a foreign key
        if (Schema::hasColumn('things', 'type')) {
            // First, ensure the column is unsigned (since it references general_types.id which is smallIncrements)
            // But we need to check if the column is already the correct type
            try {
                Schema::table('things', static function (Blueprint $table) {
                    // Make sure the column is unsigned if it's not already
                    // This might fail if the column is already unsigned, so we'll wrap in try-catch
                    if (DB::getSchemaBuilder()->getColumnType('things', 'type') !== 'int') {
                        $table->smallInteger('type')->unsigned()->nullable(false)->change();
                    }
                });
            } catch (\Exception $e) {
                // Column might already be unsigned or we can't change it
            }

            // Add the foreign key constraint
            try {
                Schema::table('things', static function (Blueprint $table) {
                    $table->foreign('type')
                        ->references('id')
                        ->on('general_types')
                        ->onDelete('restrict'); // Prevent deletion if referenced
                });
            } catch (\Exception $e) {
                // Foreign key might already exist
                if (!str_contains($e->getMessage(), 'already exists')) {
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
        // Check if the foreign key exists before trying to drop it
        try {
            Schema::table('things', static function (Blueprint $table) {
                $table->dropForeign(['type']);
            });
        } catch (\Exception $e) {
            // Foreign key might not exist
        }
    }
}
