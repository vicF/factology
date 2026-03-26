<?php

namespace Tests\Feature;

use App\Models\Classes\UserClass;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

class ObjectCreationTest extends TestCase
{
    use SafeRefreshDatabase,
        CreatesTestUsers;  // Refreshes DB for each test

    /** @test
     * @throws \Exception
     */
    public function it_can_create_a_user()
    {
        $user = $this->createTestUser()->getUser();

        // Act as this user
        $this->actingAs($user);
        $userData = [
            'name' => 'John Doe',
            'email' => 'john@example.com',
            'password' => 'password123',
        ];
        $model = new UserClass($userData);
        $model->save();
        $this->assertDatabaseHas('users', [
            'email' => 'john@example.com',
        ]);
    }
}
