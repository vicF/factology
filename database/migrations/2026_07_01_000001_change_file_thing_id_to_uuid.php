<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Change photo_files.file_thing_id from char(36) to uuid to match
        // things.thing_id type in PostgreSQL. Without this, JOINs between
        // things.thing_id (uuid) and photo_files.file_thing_id (char) fail with:
        // "operator does not exist: uuid = character"
        // Drop the unique constraint first, alter the column, then recreate it.
        // Explicit USING clause ensures PostgreSQL knows how to cast char(36) -> uuid.
        Schema::table('photo_files', function (Blueprint $table) {
            $table->dropUnique('photo_files_file_thing_id_unique');
        });

        DB::statement("ALTER TABLE photo_files ALTER COLUMN file_thing_id TYPE uuid USING file_thing_id::uuid");

        Schema::table('photo_files', function (Blueprint $table) {
            $table->unique('file_thing_id', 'photo_files_file_thing_id_unique');
        });
    }

    public function down(): void
    {
        Schema::table('photo_files', function (Blueprint $table) {
            $table->dropUnique('photo_files_file_thing_id_unique');
        });

        DB::statement("ALTER TABLE photo_files ALTER COLUMN file_thing_id TYPE char(36) USING file_thing_id::text");

        Schema::table('photo_files', function (Blueprint $table) {
            $table->unique('file_thing_id', 'photo_files_file_thing_id_unique');
        });
    }
};
