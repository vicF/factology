<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The link translation column is obsolete: the arrowed LinkDescription
        // component renders the relation text, and any meaningful translation
        // text was promoted to links.description by the preceding migration.
        if (Schema::hasColumn('links', 'translation')) {
            Schema::table('links', function (Blueprint $table) {
                $table->dropColumn('translation');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasColumn('links', 'translation')) {
            Schema::table('links', function (Blueprint $table) {
                $table->string('translation', 255)->nullable();
            });
        }
    }
};
