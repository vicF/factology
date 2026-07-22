<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Set a default on link_uuid so seeder and other bulk inserts work without explicit UUID
        DB::statement('ALTER TABLE links ALTER COLUMN link_uuid SET DEFAULT gen_random_uuid()');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE links ALTER COLUMN link_uuid DROP DEFAULT');
    }
};
