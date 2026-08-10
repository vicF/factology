<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Localization: each plain text field (name, description) gets a jsonb sibling
     * holding translations. Shape: { "lang": <code of the plain field's language>, <code>: <text>, ... }.
     */
    public function up(): void
    {
        Schema::table('things', function (Blueprint $table) {
            $table->jsonb('name_translations')->nullable()->after('name');
            $table->jsonb('description_translations')->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('things', function (Blueprint $table) {
            $table->dropColumn(['name_translations', 'description_translations']);
        });
    }
};
