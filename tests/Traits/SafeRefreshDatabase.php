<?php
// tests/Traits/SafeRefreshDatabase.php

namespace Tests\Traits;

use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Traits\SafeDatabaseGuard;

/**
 * Safe version of RefreshDatabase trait.
 * Enforces database name validation BEFORE any destructive operation.
 */
trait SafeRefreshDatabase
{
    use RefreshDatabase {
        refreshDatabase as protected originalRefreshDatabase;
    }
    use SafeDatabaseGuard;

    /**
     * Override the core refresh method.
     * This runs BEFORE migrate:fresh / schema drop / transaction begin.
     */
    protected function refreshDatabase(): void
    {
        // Use the shared protection method
        $this->guardAgainstUnsafeDatabase();

        // Proceed with Laravel's original refresh logic
        $this->originalRefreshDatabase();
    }
}
