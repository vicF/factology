<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    protected function setUp(): void
    {
        parent::setUp();

        // Only meaningful when database is about to be used / refreshed
        if ($this->isRefreshingDatabase()) {
            $this->guardTestDatabaseName();
        }
    }

    /**
     * Check if RefreshDatabase trait is active in current test
     */
    private function isRefreshingDatabase(): bool
    {
        // Very reliable way: check if the trait added its refresh callback
        return isset($this->refreshDatabaseCallback);
    }

    private function guardTestDatabaseName(): void
    {
        $dbName = DB::getDatabaseName();

        $allowed = [
            ':memory:',
            'factology_tmp_test',
        ];

        // Also allow Laravel parallel testing suffixes: factology_tmp_test_1, _2, ...
        if (preg_match('/^factology_tmp_test(_\d+)?$/', $dbName)) {
            return;
        }

        if (in_array($dbName, $allowed, true)) {
            return;
        }

        if (str_ends_with($dbName, '_test') || str_ends_with($dbName, '_tests')) {
            return;
        }

        throw new \RuntimeException(
            "Unsafe database name detected during test setup: '{$dbName}'.\n" .
            "Only ':memory:', 'factology_tmp_test' (with optional _N suffix), or names ending in '_test'/'_tests' are allowed."
        );
    }
}
