<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('external_links')) {
            return;
        }

        // External links are classified by domain at render time (domain mask),
        // so the url_type_id column is never required anymore.
        DB::statement('ALTER TABLE external_links ALTER COLUMN url_type_id DROP NOT NULL');
    }

    public function down(): void
    {
        if (!Schema::hasTable('external_links')) {
            return;
        }

        DB::statement('ALTER TABLE external_links ALTER COLUMN url_type_id SET NOT NULL');
    }
};
