<?php

// tests/Traits/SafeRefreshDatabase.php

namespace Tests\Traits;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Dotenv\Dotenv;

/**
 * Safe version of RefreshDatabase trait.
 * Enforces database name validation BEFORE any destructive operation.
 * Also forces usage of dedicated test credentials.
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
        $this->forceTestDatabaseCredentialsAndCreateIfNeeded();
        $this->guardAgainstUnsafeDatabase();

        // Proceed with Laravel's original refresh logic
        $this->originalRefreshDatabase();
    }

    /**
     * Force usage of dedicated test database credentials.
     * Loads from .env.testing if present, otherwise uses hardcoded defaults.
     * Respects the existing host/port from main Laravel connection config.
     * First checks if test DB is accessible with current connection.
     * Creates DB + user + grants only if needed (using privileged connection).
     */
    private function forceTestDatabaseCredentialsAndCreateIfNeeded(): void
    {
        // 1. Try to load dedicated .env.testing file (if exists)
        $envTestingPath = base_path('.env.testing');
        $useHardcoded = !file_exists($envTestingPath);

        if (!$useHardcoded) {
            $dotenv = Dotenv::createImmutable(base_path(), '.env.testing');
            $dotenv->safeLoad();
        }

        // 2. Get the main connection name (usually 'mysql')
        $connectionName = config('database.default', 'mysql');

        // 3. Read existing config for host/port (from config/database.php or .env)
        $existingConfig = Config::get("database.connections.{$connectionName}", []);

        // 4. Define hardcoded defaults once (single source of truth)
        $defaultDatabase = 'factology_tmp_test';
        $defaultUsername = 'factology_test';
        $defaultPassword = 'test_pass';

        // 5. Determine test database & credentials
        $testDatabase = $useHardcoded
            ? $defaultDatabase
            : env('TEST_DB_DATABASE', $defaultDatabase);

        $testUsername = $useHardcoded
            ? $defaultUsername
            : env('TEST_DB_USERNAME', $defaultUsername);

        $testPassword = $useHardcoded
            ? $defaultPassword
            : env('TEST_DB_PASSWORD', $defaultPassword);

        // 6. Privileged credentials for creation/grants (fallback to current if not set)
        $adminUsername = env('TEST_ADMIN_DB_USERNAME', $existingConfig['username'] ?? 'root');
        $adminPassword = env('TEST_ADMIN_DB_PASSWORD', $existingConfig['password'] ?? '');

        // 7. Check if current connection can already access the test database
        $canUseCurrent = $this->canAccessDatabaseWithCurrentConnection(
            $connectionName,
            $testDatabase
        );

        if ($canUseCurrent) {
            // Current connection (dbuser) can access the test DB → just switch DB name
            // No need to create or grant anything
            Config::set("database.connections.{$connectionName}.database", $testDatabase);
            // username/password remain as-is (current ones)
        } else {
            // Current user cannot access test DB → create DB + dedicated test user + grant
            $this->ensureTestDatabaseExistsAndGrantPrivileges(
                $connectionName,
                $existingConfig['host'] ?? '127.0.0.1',
                $existingConfig['port'] ?? '3306',
                $testDatabase,
                $testUsername,
                $testPassword,
                $adminUsername,
                $adminPassword
            );

            // Switch to dedicated test credentials
            Config::set("database.connections.{$connectionName}.database", $testDatabase);
            Config::set("database.connections.{$connectionName}.username", $testUsername);
            Config::set("database.connections.{$connectionName}.password", $testPassword);
        }

        // Purge & reconnect
        DB::purge($connectionName);
        DB::reconnect($connectionName);
    }

    /**
     * Check if current connection can access the desired test database.
     * Temporarily switches DB name to test one, tries to connect, then restores original.
     * Returns true if DB exists and current user has sufficient privileges.
     */
    private function canAccessDatabaseWithCurrentConnection(string $connection, string $testDatabase): bool
    {
        $originalDatabase = config("database.connections.{$connection}.database");

        try {
            // Temporarily switch to test DB name
            Config::set("database.connections.{$connection}.database", $testDatabase);
            DB::purge($connection);
            DB::reconnect($connection);

            // Try to get PDO connection
            DB::connection($connection)->getPdo();

            // Success → DB exists and user can access it
            return true;
        } catch (\Exception $e) {
            // Failure → cannot access (missing DB or no privileges)
            return false;
        } finally {
            // Always restore original DB name, even on exception
            Config::set("database.connections.{$connection}.database", $originalDatabase);
            DB::purge($connection);
            DB::reconnect($connection);
        }
    }

    /**
     * Ensure the test database exists and grant full privileges to the test user.
     * Uses privileged credentials for creation and GRANT statements.
     */
    private function ensureTestDatabaseExistsAndGrantPrivileges(
        string $connection,
        string $host,
        string $port,
        string $database,
        string $testUser,
        string $testPass,
        string $adminUser,
        string $adminPass
    ): void {
        try {
            $adminConfigKey = 'temp_admin_connection';

            $adminConfig = Config::get("database.connections.{$connection}", []);
            $adminConfig['host']     = $host;
            $adminConfig['port']     = $port;
            $adminConfig['username'] = $adminUser;
            $adminConfig['password'] = $adminPass;
            $adminConfig['database'] = null;

            Config::set("database.connections.{$adminConfigKey}", $adminConfig);
            DB::purge($adminConfigKey);
            DB::reconnect($adminConfigKey);

            $adminConn = DB::connection($adminConfigKey);

            // Create database if not exists
            $adminConn->statement(
                "CREATE DATABASE IF NOT EXISTS `{$database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
            );

            // Create test user if not exists + set password
            $adminConn->statement(
                "CREATE USER IF NOT EXISTS '{$testUser}'@'%' IDENTIFIED BY '{$testPass}';"
            );

            // Grant full privileges on the test database only
            $adminConn->statement(
                "GRANT ALL PRIVILEGES ON `{$database}`.* TO '{$testUser}'@'%';"
            );

            // Apply changes
            $adminConn->statement("FLUSH PRIVILEGES;");

            // Clean up
            DB::purge($adminConfigKey);
            Config::offsetUnset("database.connections.{$adminConfigKey}");
        } catch (\Exception $e) {
            /*throw new \RuntimeException(
                "Failed to create/grant test database '{$database}' for user '{$testUser}': " . $e->getMessage() . "\n" .
                "Verify that the privileged credentials (root/admin) have CREATE USER / GRANT OPTION privileges."
            );*/
        }
    }

    /**
     * Prevent destructive operations on non-test databases.
     * Acts as a secondary safety net.
     */
    private function guardAgainstUnsafeDatabase(): void
    {
        $dbName = DB::getDatabaseName();

        $allowed = [
            ':memory:',
            'factology_tmp_test',
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
                "Allowed: ':memory:', 'factology_tmp_test' (with optional _N suffix), or names ending with '_test'/'_tests'."
            );
        }
    }
}
