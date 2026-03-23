<?php
// app/Http/Controllers/TestDatabaseController.php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Console\Output\BufferedOutput;
use App\Traits\SafeDatabaseGuard;

class TestDatabaseController extends Controller
{
    use SafeDatabaseGuard;

    public function __construct()
    {
        abort_unless(app()->environment('testing'), 404);
        $this->guardAgainstUnsafeDatabase();
    }

    /**
     * Reset database using artisan commands
     */
    public function reset()
    {
        try {
            $output = new BufferedOutput();

            // Run migrations fresh with seed
            Artisan::call('migrate:fresh', ['--seed' => true, '--force' => true], $output);

            return response()->json([
                'success' => true,
                'message' => 'Database refreshed successfully',
                'database' => DB::getDatabaseName(),
                'output' => $output->fetch()
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ], 500);
        }
    }

    /**
     * Run migrations only
     */
    public function migrate()
    {
        try {
            $output = new BufferedOutput();

            Artisan::call('migrate', ['--force' => true], $output);

            return response()->json([
                'success' => true,
                'output' => $output->fetch()
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Check migration status
     */
    public function migrationStatus()
    {
        try {
            $output = new BufferedOutput();

            Artisan::call('migrate:status', [], $output);

            return response()->json([
                'success' => true,
                'output' => $output->fetch()
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get database status
     */
    public function status()
    {
        try {
            $tables = DB::select('SHOW TABLES');
            $tableNames = array_map(function($table) {
                return reset($table);
            }, $tables);

            return response()->json([
                'success' => true,
                'environment' => app()->environment(),
                'database' => DB::getDatabaseName(),
                'is_safe' => $this->isSafeDatabase(),
                'tables' => $tableNames,
                'table_count' => count($tableNames)
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Clean up test data
     */
    public function cleanAll()
    {
        try {
            $stats = [];

            // Clean test users
            $stats['users'] = DB::table('users')
                ->where('email', 'like', '%test%')
                ->orWhere('email', 'like', '%tester%')
                ->delete();

            return response()->json([
                'success' => true,
                'message' => 'Test data cleaned',
                'deleted' => $stats
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Create a test user
     */
    public function createUser(Request $request)
    {
        try {
            $user = \App\Models\User::create([
                'name' => $request->input('name', 'Test User'),
                'email' => $request->input('email', 'test-' . time() . '@example.com'),
                'password' => bcrypt($request->input('password', 'password123')),
            ]);

            return response()->json([
                'success' => true,
                'user' => $user
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Delete a test user
     */
    public function deleteUser($id)
    {
        try {
            $user = \App\Models\User::find($id);

            if (!$user) {
                return response()->json([
                    'success' => false,
                    'message' => 'User not found'
                ], 404);
            }

            $user->delete();

            return response()->json([
                'success' => true,
                'message' => 'User deleted'
            ]);

        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
