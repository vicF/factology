<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('links', 'record_updated')) {
            return;
        }

        Schema::table('links', function (Blueprint $table) {
            $table->timestamp('record_updated')->nullable();
        });

        // Backfill existing rows, then make the column NOT NULL with a default so
        // every insert path gets a value even when it doesn't set it explicitly.
        DB::table('links')->update(['record_updated' => now()]);
        DB::statement('ALTER TABLE links ALTER COLUMN record_updated SET NOT NULL');
        DB::statement('ALTER TABLE links ALTER COLUMN record_updated SET DEFAULT CURRENT_TIMESTAMP');
    }

    public function down(): void
    {
        if (Schema::hasColumn('links', 'record_updated')) {
            Schema::table('links', function (Blueprint $table) {
                $table->dropColumn('record_updated');
            });
        }
    }
};
