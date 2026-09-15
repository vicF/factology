<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Allow identity-file registration: make personal-data columns nullable on
 * users, and create the invitations table for admin-managed sign-ups.
 *
 * Personal data (name, email, password) is optional so a user can register
 * with only a public key (Ed25519) — no name, no email, no password.
 *
 * The invitations table lets admins pre-create invitations that carry an
 * optional thing_id (for pre-assigned UUIDs) and an optional public_key
 * (reserved for a specific identity), claimed via challenge/response.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ── 1. Make personal-data columns nullable ──────────────────────
        Schema::table('users', function (Blueprint $table) {
            $table->string('name')->nullable()->change();
            $table->string('email')->nullable()->change();
            $table->string('password')->nullable()->change();
        });

        // ── 2. Invitations table ────────────────────────────────────────
        Schema::create('invitations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('creator_id');
            $table->string('token', 64)->unique();
            $table->text('public_key')->nullable()->comment(
                'If set, only this Ed25519 public key can claim the invitation.'
            );
            $table->uuid('thing_id')->nullable()->comment(
                'Optional pre-assigned UUID. If the claimant already has a UUID, '
                . 'a SAME_AS link can be created between the two.'
            );
            $table->text('note')->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('claimed_at')->nullable();
            $table->timestamps();

            $table->foreign('creator_id')
                  ->references('id')->on('users')
                  ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invitations');

        // Revert columns to NOT NULL (may fail if NULLs exist).
        Schema::table('users', function (Blueprint $table) {
            $table->string('name')->nullable(false)->change();
            $table->string('email')->nullable(false)->change();
            $table->string('password')->nullable(false)->change();
        });
    }
};