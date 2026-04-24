<?php
// database/seeders/TestDatabaseSeeder.php

namespace Database\Seeders;

use App\Models\Classes\UserClass;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class TestDatabaseSeeder extends Seeder
{
    public function run()
    {

        // Create default test user (always available)
        (new UserClass(
            [
                'name' => 'Test User',
                'email' => 'test@test.com',
                'email_verified_at' => now(),
                'password' => Hash::make('qqqqqqqq'),
                'remember_token' => Str::random(10),
                'created_at' => now(),
                'updated_at' => now(),
            ]
        ))->save();

        // Optional: Add an admin user
        (new UserClass(
            [
                'name' => 'Admin User',
                'email' => 'admin@test.com',
                'email_verified_at' => now(),
                'password' => Hash::make('qqqqqqqq'),
                'remember_token' => Str::random(10),
                'created_at' => now(),
                'updated_at' => now(),
            ]
        ))->save();

        // You can add more default users here
        // DB::table('users')->updateOrInsert(...);
    }
}
