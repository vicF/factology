<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('things', function (Blueprint $table) {
            $table->timestamp('imported_at')->nullable()->after('record_updated');
        });

        Schema::table('links', function (Blueprint $table) {
            $table->timestamp('imported_at')->nullable()->after('deleted');
        });
    }

    public function down(): void
    {
        Schema::table('things', function (Blueprint $table) {
            $table->dropColumn('imported_at');
        });

        Schema::table('links', function (Blueprint $table) {
            $table->dropColumn('imported_at');
        });
    }
};
