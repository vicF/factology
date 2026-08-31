<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('things', 'source_service')) {
            Schema::table('things', function (Blueprint $table) {
                $table->string('source_service', 50)->nullable()->after('server_uuid');
                $table->string('source_external_id', 255)->nullable()->after('source_service');
                $table->index(['owner', 'source_service', 'source_external_id'], 'things_source_idx');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('things', 'source_service')) {
            Schema::table('things', function (Blueprint $table) {
                $table->dropIndex('things_source_idx');
                $table->dropColumn('source_service');
                $table->dropColumn('source_external_id');
            });
        }
    }
};