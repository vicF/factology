<?php
// app/Http/Controllers/TestDatabaseController.php

namespace App\Http\Controllers;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Traits\SafeDatabaseGuard;

class TestDatabaseController extends Controller
{
    use SafeDatabaseGuard, RefreshDatabase;

    public function __construct()
    {
        // Only allow in testing environment
        abort_unless(app()->environment('testing'), 404);

        // Use the shared protection method
        $this->guardAgainstUnsafeDatabase();
    }

    /**
     * Clean up test users by email pattern
     */
    public function cleanup(Request $request)
    {
        $email = $request->input('email');

        if ($email) {
            // Delete specific test user
            $deleted = DB::table('users')->where('email', $email)->delete();
            return response()->json([
                'message' => $deleted ? "User {$email} deleted" : "User {$email} not found",
                'deleted' => $deleted
            ]);
        }

        // Delete all test users (emails containing 'test' or 'tester')
        $deleted = DB::table('users')
            ->where('email', 'like', '%test%')
            ->orWhere('email', 'like', '%tester%')
            ->delete();

        return response()->json([
            'message' => "Deleted {$deleted} test users",
            'count' => $deleted
        ]);
    }

    /**
     * Reset database
     */
    public function reset()
    {
        try {
            // This is the exact same method your PHP tests use!
            $this->refreshDatabase();

            return response()->json([
                'message' => 'Database refreshed successfully',
                'database' => \DB::getDatabaseName()
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Database refresh failed',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Refresh database (alias for reset)
     */
    public function refresh()
    {
        return $this->reset();
    }

    /**
     * Create a test user
     */
    public function createUser(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users',
            'password' => 'required|string|min:6',
        ]);

        $user = \App\Models\User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => bcrypt($validated['password']),
        ]);

        return response()->json($user, 201);
    }

    /**
     * Delete a specific user by ID (with safety check)
     */
    public function deleteUser($id)
    {
        $user = \App\Models\User::find($id);

        if (!$user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        // Extra safety: only delete if email contains test
        if (!str_contains($user->email, 'test') && !str_contains($user->email, 'tester')) {
            return response()->json([
                'message' => 'Cannot delete non-test user',
                'email' => $user->email
            ], 403);
        }

        $user->delete();

        return response()->json([
            'message' => 'User deleted',
            'id' => $id,
            'email' => $user->email
        ]);
    }

    /**
     * Clean all test data across tables
     */
    public function cleanAll()
    {
        $stats = [];

        // Clean users
        $stats['users'] = DB::table('users')
            ->where('email', 'like', '%test%')
            ->orWhere('email', 'like', '%tester%')
            ->delete();

        // Clean objects
        if (Schema::hasTable('objects')) {
            $stats['objects'] = DB::table('objects')
                ->where('name', 'like', '%test%')
                ->delete();
        }

        // Clean links
        if (Schema::hasTable('links')) {
            $stats['links'] = DB::table('links')
                ->where('title', 'like', '%test%')
                ->delete();
        }

        return response()->json([
            'message' => 'Test data cleaned',
            'deleted' => $stats
        ]);
    }

    /**
     * Get database status (for debugging)
     */
    public function status()
    {
        return response()->json([
            'environment' => app()->environment(),
            'database' => DB::getDatabaseName(),
            'is_safe' => $this->isSafeDatabase(),
            'tables' => array_values(DB::select('SHOW TABLES'))
        ]);
    }
}
