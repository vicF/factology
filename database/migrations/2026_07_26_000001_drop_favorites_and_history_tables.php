<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Drop the unused `favorites` and `history` tables.
 *
 * These tables were created by the initial migration but were never used
 * by any application code (no API, no models, no UI). The favorites
 * feature is now implemented using the existing `links` table with a
 * dedicated link type (MY_FAVORITE).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('favorites');
        Schema::dropIfExists('history');
    }

    public function down(): void
    {
        // Re-create favorites table if rolled back
        if (!Schema::hasTable('favorites')) {
            Schema::create('favorites', function ($table) {
                $table->bigIncrements('id');
                $table->uuid('user_id');
                $table->uuid('favorite_id');
                $table->foreign('favorite_id', 'favorites_favorite_id_foreign')
                    ->references('thing_id')->on('things');
                $table->foreign('user_id', 'favorites_user_id_foreign')
                    ->references('thing_id')->on('users');
            });
        }

        // Re-create history table if rolled back
        if (!Schema::hasTable('history')) {
            Schema::create('history', function ($table) {
                $table->bigIncrements('id');
                $table->uuid('user_id');
                $table->uuid('history_id');
                $table->timestamp('viewed_at')->useCurrent()->useCurrentOnUpdate();
                $table->foreign('history_id', 'history_history_id_foreign')
                    ->references('thing_id')->on('things')->onDelete('cascade');
                $table->foreign('user_id', 'history_user_id_foreign')
                    ->references('thing_id')->on('users')->onDelete('cascade');
            });
        }
    }
};
