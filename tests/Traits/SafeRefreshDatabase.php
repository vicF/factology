<?php

// tests/Traits/SafeRefreshDatabase.php

namespace Tests\Traits;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

/**
 * Safe version of RefreshDatabase trait.
 * Enforces database name validation BEFORE any destructive operation.
 * Use this instead of the original RefreshDatabase.
 *
 * Note: Database credentials should come from environment files:
 * - Local: .env (with your Docker credentials)
 * - CI: .env.github (copied to .env in GitHub Actions)
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
        // Just guard against unsafe databases
        $this->guardAgainstUnsafeDatabase();

        // Proceed with Laravel's original refresh logic
        $this->originalRefreshDatabase();
    }

    /**
     * Prevent destructive operations on non-test databases.
     * Acts as a safety net.
     */
    private function guardAgainstUnsafeDatabase(): void
    {
        $dbName = DB::getDatabaseName();

        $allowed = [
            ':memory:',
            'factology_tmp_test',
            'testing',        // CI database
            'test',
            'tests',
        ];

        $isAllowed = in_array($dbName, $allowed, true);

        if (!$isAllowed) {
            $isAllowed = preg_match('/^factology_tmp_test(_\d+)?$/i', $dbName) === 1;
        }

        if (!$isAllowed) {
            $isAllowed = preg_match('/_test(s)?$/i', $dbName) === 1;
        }

        if (!$isAllowed) {
            throw new \RuntimeException(
                "BLOCKED: RefreshDatabase is about to run on potentially dangerous database '{$dbName}'.\n" .
                "Allowed: ':memory:', 'factology_tmp_test' (with optional _N suffix), 'testing', or names ending with '_test'/'_tests'.\n" .
                "Database credentials should come from your environment file (.env for local, .env.ci for CI)."
            );
        }
    }
}
