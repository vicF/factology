<?php

namespace Tests\Traits;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

/**
 * Safe version of RefreshDatabase trait.
 * Enforces database name validation BEFORE any destructive operation.
 * Use this instead of the original RefreshDatabase.
 */
trait SafeRefreshDatabase
{
    use RefreshDatabase {
        refreshDatabase as protected originalRefreshDatabase;
    }

    /**
     * Override the core refresh method.
     * This runs BEFORE migrate:fresh / schema drop / transaction begin.
     */
    protected function refreshDatabase(): void
    {
        $this->guardAgainstUnsafeDatabase();

        // Proceed with Laravel's original refresh logic
        $this->originalRefreshDatabase();
    }

    /**
     * Prevent destructive operations on non-test databases.
     */
    private function guardAgainstUnsafeDatabase(): void
    {
        $dbName = DB::getDatabaseName();

        // Define allowed database names / patterns
        $allowed = [
            ':memory:',
            'factology_tmp_test',
        ];

        $isAllowed = in_array($dbName, $allowed, true);

        // Also allow Laravel parallel testing suffixes (factology_tmp_test_1, _2, ...)
        if (!$isAllowed) {
            $isAllowed = preg_match('/^factology_tmp_test(_\d+)?$/i', $dbName) === 1;
        }

        // Add more patterns if needed (e.g. ending with _test or _tests)
        if (!$isAllowed) {
            $isAllowed = preg_match('/_test(s)?$/i', $dbName) === 1;
        }

        if (!$isAllowed) {
            throw new \RuntimeException(
                "BLOCKED: RefreshDatabase is about to run on potentially dangerous database '{$dbName}'.\n" .
                "Allowed: ':memory:', 'factology_tmp_test' (with optional _N suffix for parallel), or names ending with '_test'/'_tests'.\n" .
                "→ Use Tests\Traits\SafeRefreshDatabase instead of RefreshDatabase.\n" .
                "→ Check .env.testing / phpunit.xml / codeception.yml DB_DATABASE value."
            );
        }
    }
}
