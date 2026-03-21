<?php
// app/Traits/SafeDatabaseGuard.php

namespace App\Traits;

use Illuminate\Support\Facades\DB;

trait SafeDatabaseGuard
{
    /**
     * Prevent destructive operations on non-test databases.
     * Acts as a safety net for both tests and API endpoints.
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
                "BLOCKED: Operation attempted on potentially dangerous database '{$dbName}'.\n" .
                "Allowed: ':memory:', 'factology_tmp_test' (with optional _N suffix), 'testing', or names ending with '_test'/'_tests'.\n" .
                "Database credentials should come from your environment file (.env for local, .env.ci for CI)."
            );
        }
    }

    /**
     * Check if current database is safe for test operations
     */
    private function isSafeDatabase(): bool
    {
        try {
            $this->guardAgainstUnsafeDatabase();
            return true;
        } catch (\RuntimeException $e) {
            return false;
        }
    }
}
