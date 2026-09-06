<?php
// app/Http/Controllers/TestDatabaseController.php

namespace App\Http\Controllers;

use App\Models\Classes\UserClass;
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
            $driver = DB::connection()->getDriverName();
            if ($driver === 'pgsql') {
                $tables = DB::select("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
                $tableNames = array_map(function($t) { return $t->table_name; }, $tables);
            } else {
                $tables = DB::select('SHOW TABLES');
                $tableNames = array_map(function($table) {
                    return reset($table);
                }, $tables);
            }

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
            $user = (new UserClass([
                'name' => $request->input('name', 'Test User'),
                'email' => $request->input('email', 'test-' . time() . '@example.com'),
                'password' => bcrypt($request->input('password', 'password123')),
            ]))->save()->getUser();

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
     * Seed test classes and objects for acceptance tests
     */
    public function seedTestObjects()
    {
        try {
            // These UUIDs are NOT stored in VCS — they are ephemeral per run
            $testClassId = \Illuminate\Support\Str::uuid()->toString();
            $testObjectId = \Illuminate\Support\Str::uuid()->toString();
            $testObject2Id = \Illuminate\Support\Str::uuid()->toString();

            // 1. Create a public test class under Something
            DB::table('things')->insert([
                'thing_id'    => $testClassId,
                'name'        => 'Test Class',
                'description' => 'Auto-created test class for acceptance tests',
                'type'        => \Fokin\Facts\Data\UUID::G_CLASS,
                'public'      => true,
                'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
            ]);
            DB::table('links')->insert([
                'one_thing_id'   => \Fokin\Facts\Data\UUID::SOMETHING,
                'link_type_id'   => \Fokin\Facts\Data\UUID::LINK_TO_PARENT,
                'other_thing_id' => $testClassId,
            ]);

            // 2. Create public test objects of that class
            $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
            DB::table('things')->insert([
                array_merge(['thing_id' => $testObjectId,  'name' => 'Test Object Alpha', 'description' => 'First test object', 'type' => \Fokin\Facts\Data\UUID::G_THING, 'public' => true], ['server_uuid' => $serverUuid]),
                array_merge(['thing_id' => $testObject2Id, 'name' => 'Test Object Beta',  'description' => 'Second test object', 'type' => \Fokin\Facts\Data\UUID::G_THING, 'public' => true], ['server_uuid' => $serverUuid]),
            ]);
            DB::table('links')->insert([
                'one_thing_id'   => $testObjectId,
                'link_type_id'   => \Fokin\Facts\Data\UUID::LINK_TO_CLASS,
                'other_thing_id' => $testClassId,
            ]);
            DB::table('links')->insert([
                'one_thing_id'   => $testObject2Id,
                'link_type_id'   => \Fokin\Facts\Data\UUID::LINK_TO_CLASS,
                'other_thing_id' => $testClassId,
            ]);

            return response()->json([
                'success' => true,
                'data' => [
                    'class_id'  => $testClassId,
                    'object_id' => $testObjectId,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
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
