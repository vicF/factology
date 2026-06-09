<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::table('links')->where('deleted', 1)->delete();
        Schema::table('links', function (Blueprint $table) {
            $table->dropColumn('deleted');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('links', function (Blueprint $table) {
            $table->addColumn('boolean', 'deleted')
                ->default(0)
                ->comment('Mark for deletion')
                ->nullable(false);
        });
    }
};
