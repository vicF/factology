<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('legal_documents', function (Blueprint $table) {
            $table->id();
            $table->string('type'); // 'terms' or 'privacy'
            $table->string('country', 5)->default('*'); // 'RU', 'US', 'DE', '*' = universal
            $table->string('locale', 10)->default('en'); // 'ru', 'en'
            $table->string('version', 20)->default('1.0.0');
            $table->string('title');
            $table->text('content');
            $table->timestamps();

            $table->unique(['type', 'country', 'locale', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_documents');
    }
};
