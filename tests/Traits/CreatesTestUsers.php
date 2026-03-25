<?php

namespace Tests\Traits;

use App\Models\Classes\UserClass;
use Illuminate\Support\Str;

trait CreatesTestUsers
{
    protected function createTestUser(array $overrides = []): UserClass
    {
        $defaultData = [
            'name' => 'Test User',
            'email' => 'test_' . Str::random(8) . '@example.com',
            'password' => 'password123',
            // Add any other required fields
        ];

        $data = array_merge($defaultData, $overrides);

        $UserClass = new UserClass($data);
        $UserClass->save();

        return $UserClass;
    }
}
