<?php
// database/seeders/TestDatabaseSeeder.php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class TestDatabaseSeeder extends Seeder
{
    public function run()
    {
        // Create default test user (always available)
        DB::table('users')->updateOrInsert(
            ['email' => 'test@test.com'],
            [
                'name' => 'Test UserClass',
                'email' => 'test@test.com',
                'email_verified_at' => now(),
                'password' => Hash::make('qqqqqqqq'),
                'remember_token' => Str::random(10),
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        // Optional: Add an admin user
        DB::table('users')->updateOrInsert(
            ['email' => 'admin@test.com'],
            [
                'name' => 'Admin UserClass',
                'email' => 'admin@test.com',
                'email_verified_at' => now(),
                'password' => Hash::make('qqqqqqqq'),
                'remember_token' => Str::random(10),
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        // You can add more default users here
        // DB::table('users')->updateOrInsert(...);
    }
}
