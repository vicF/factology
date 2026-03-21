<?php
// app/Http/Controllers/TestDatabaseController.php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
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
            // Capture all output
            $output = [];

            // Run migrations fresh with seed
            Artisan::call('migrate:fresh', ['--seed' => true, '--force' => true], function($type, $buffer) use (&$output) {
                $output[] = $buffer;
            });

            return response()->json([
                'success' => true,
                'message' => 'Database refreshed successfully',
                'database' => DB::getDatabaseName(),
                'output' => implode("\n", $output)
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
            $output = [];

            Artisan::call('migrate', ['--force' => true], function($type, $buffer) use (&$output) {
                $output[] = $buffer;
            });

            return response()->json([
                'success' => true,
                'output' => implode("\n", $output)
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
            $output = [];

            Artisan::call('migrate:status', [], function($type, $buffer) use (&$output) {
                $output[] = $buffer;
            });

            return response()->json([
                'success' => true,
                'output' => implode("\n", $output)
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
        $stats = [];

        $stats['users'] = DB::table('users')
            ->where('email', 'like', '%test%')
            ->orWhere('email', 'like', '%tester%')
            ->delete();

        return response()->json([
            'message' => 'Test data cleaned',
            'deleted' => $stats
        ]);
    }

    /**
     * Create a test user
     */
    public function createUser(Request $request)
    {
        $user = \App\Models\User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => bcrypt($request->password),
        ]);

        return response()->json($user, 201);
    }

    /**
     * Delete a test user
     */
    public function deleteUser($id)
    {
        $user = \App\Models\User::find($id);

        if (!$user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        $user->delete();

        return response()->json(['message' => 'User deleted']);
    }

    /**
     * Get database status
     */
    public function status()
    {
        return response()->json([
            'environment' => app()->environment(),
            'database' => DB::getDatabaseName(),
            'is_safe' => $this->isSafeDatabase()
        ]);
    }
}
