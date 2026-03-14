<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        // Hard-delete existing records where one_thing_id equals other_thing_id
        DB::statement('
            DELETE FROM links
            WHERE one_thing_id = other_thing_id
        ');

        // Add CHECK constraint to prevent one_thing_id = other_thing_id
        DB::statement('
            ALTER TABLE links
            ADD CONSTRAINT links_one_thing_not_equal_other_thing
            CHECK (one_thing_id != other_thing_id)
        ');
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        // Drop CHECK constraint
        DB::statement('
            ALTER TABLE links
            DROP CONSTRAINT links_one_thing_not_equal_other_thing
        ');
    }
};
