<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        // Add link_uuid column for stable export/import matching
        if (!Schema::hasColumn('links', 'link_uuid')) {
            Schema::table('links', function (Blueprint $table) {
                $table->uuid('link_uuid')->nullable()->unique();
            });

            // Backfill existing rows with generated UUIDs
            $offset = 0;
            $chunkSize = 1000;
            do {
                $rows = DB::table('links')
                    ->whereNull('link_uuid')
                    ->offset($offset)
                    ->limit($chunkSize)
                    ->get();

                foreach ($rows as $row) {
                    DB::table('links')
                        ->where('link_id', $row->link_id)
                        ->update(['link_uuid' => (string) Str::uuid()]);
                }

                $offset += $chunkSize;
            } while ($rows->count() === $chunkSize);

            // Make link_uuid NOT NULL after backfill
            DB::statement('ALTER TABLE links ALTER COLUMN link_uuid SET NOT NULL');
        }

        // Add deleted column for soft-delete support (mirrors things.deleted)
        if (!Schema::hasColumn('links', 'deleted')) {
            Schema::table('links', function (Blueprint $table) {
                $table->boolean('deleted')->default(false)->after('public');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('links', 'link_uuid')) {
            Schema::table('links', function (Blueprint $table) {
                $table->dropColumn('link_uuid');
            });
        }
        if (Schema::hasColumn('links', 'deleted')) {
            Schema::table('links', function (Blueprint $table) {
                $table->dropColumn('deleted');
            });
        }
    }
};
