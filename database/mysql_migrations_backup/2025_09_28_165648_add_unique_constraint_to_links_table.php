<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Delete duplicate rows, keeping the one with the lowest link_id
        DB::statement('
            DELETE l1 FROM links l1
            INNER JOIN links l2
            WHERE
                l1.link_id > l2.link_id
                AND l1.one_thing_id = l2.one_thing_id
                AND l1.other_thing_id = l2.other_thing_id
                AND l1.link_type_id = l2.link_type_id
        ');

        // Add unique constraint on one_thing_id, other_thing_id, and link_type_id
        Schema::table('links', function (Blueprint $table) {
            $table->unique(['one_thing_id', 'other_thing_id', 'link_type_id'], 'links_unique_combination');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Drop the unique constraint
        Schema::table('links', function (Blueprint $table) {
            $table->dropUnique('links_unique_combination');
        });
    }
};
