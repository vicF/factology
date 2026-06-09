<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::statement("UPDATE links
                SET one_thing_id = @temp := one_thing_id,
                    one_thing_id = other_thing_id,
                    other_thing_id = @temp
                WHERE link_type_id = '361c19af-c011-4051-9329-49c75d1ca0fb'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement("UPDATE links
            SET one_thing_id = @temp := one_thing_id,
                one_thing_id = other_thing_id,
                other_thing_id = @temp
            WHERE link_type_id = '361c19af-c011-4051-9329-49c75d1ca0fb'");
    }
};
