<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Flexible dates: each date bound (things.start/end, links.link_start/link_end)
     * gets a jsonb sibling holding display metadata.
     * Shape: { qualifier, era, precision, alternatives: [...], comment, original, degrade }.
     * The numeric columns remain plain sortable dates; the meta drives display.
     */
    public function up(): void
    {
        if (!Schema::hasColumn('things', 'start_meta')) {
            Schema::table('things', function (Blueprint $table) {
                $table->jsonb('start_meta')->nullable()->after('start');
                $table->jsonb('end_meta')->nullable()->after('end');
            });
        }

        if (!Schema::hasColumn('links', 'link_start_meta')) {
            Schema::table('links', function (Blueprint $table) {
                $table->jsonb('link_start_meta')->nullable()->after('link_start');
                $table->jsonb('link_end_meta')->nullable()->after('link_end');
            });
        }
    }

    public function down(): void
    {
        Schema::table('things', function (Blueprint $table) {
            $table->dropColumn(['start_meta', 'end_meta']);
        });
        Schema::table('links', function (Blueprint $table) {
            $table->dropColumn(['link_start_meta', 'link_end_meta']);
        });
    }
};
