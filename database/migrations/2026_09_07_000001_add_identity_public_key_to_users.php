<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Allow users to sign in with a Factology identity file.
 *
 * Stores the base64url-encoded Ed25519 public key that the account owner has
 * bound to their account. A NULL value means the user has not registered an
 * identity key and can only sign in with email/password. PostgreSQL allows
 * many NULLs in a unique index, so the constraint only protects real keys.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('identity_public_key')->nullable()->after('remember_token');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->unique('identity_public_key', 'users_identity_public_key_unique');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_identity_public_key_unique');
            $table->dropColumn('identity_public_key');
        });
    }
};
