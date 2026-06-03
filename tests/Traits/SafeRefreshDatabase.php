<?php
// tests/Traits/SafeRefreshDatabase.php

namespace Tests\Traits;

use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Traits\SafeDatabaseGuard;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/**
 * Safe version of RefreshDatabase trait.
 * Enforces database name validation BEFORE any destructive operation.
 * Also ensures PostgreSQL schema permissions after schema recreation.
 */
trait SafeRefreshDatabase
{
    use RefreshDatabase {
        refreshDatabase as protected originalRefreshDatabase;
        beginDatabaseTransaction as protected originalBeginDatabaseTransaction;
    }
    use SafeDatabaseGuard;

    /**
     * Override the core refresh method.
     * This replaces the original RefreshDatabase::refreshDatabase().
     *
     * Running migrate:fresh directly with a pre-grant of schema permissions
     * (PostgreSQL 15+ drops CREATE permission when recreating the public schema).
     */
    protected function refreshDatabase(): void
    {
        $this->guardAgainstUnsafeDatabase();

        // Step 1: Drop all tables (preserves schema permissions)
        Artisan::call('db:wipe', ['--force' => true]);

        // Step 2: Grant CREATE permission on fresh public schema
        DB::statement('GRANT ALL ON SCHEMA public TO dbuser');

        // Step 3: Run all migrations
        $exitCode = Artisan::call('migrate', ['--force' => true]);
        if ($exitCode !== 0) {
            throw new \RuntimeException(
                "migrate failed (exit $exitCode): " . Artisan::output()
            );
        }

        // Step 4: Seed bootstrap data (general_types, things, links)
        Artisan::call('db:seed', ['--force' => true]);

        // Step 5: Begin database transaction for test isolation
        $this->originalBeginDatabaseTransaction();
    }
}
