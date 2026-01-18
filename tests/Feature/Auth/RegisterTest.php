<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegisterTest extends TestCase
{
    use RefreshDatabase;

    /** @test */
    public function user_can_register_with_valid_data_and_receive_token()
    {
        $response = $this->postJson('/api/register', [
            'name'                  => 'Test User',
            'email'                 => 'testuser@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response
            ->assertStatus(201)
            ->assertJsonStructure([
                'user' => [
                    'id',
                    'name',
                    'email',
                    // add other expected fields if needed
                ],
                'token'   => ['type' => 'string'],
                'message' => ['type' => 'string'],
            ])
            ->assertJson([
                'message' => 'Registration successful',
            ]);

        $this->assertDatabaseHas('users', [
            'email' => 'testuser@example.com',
            'name'  => 'Test User',
        ]);

        // Check that token was actually created
        $user = User::where('email', 'testuser@example.com')->first();
        $this->assertNotNull($user);
        $this->assertCount(1, $user->tokens);
    }

    /** @test */
    public function registration_fails_with_missing_name()
    {
        $response = $this->postJson('/api/register', [
            'email'                 => 'testuser@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name']);
    }

    /** @test */
    public function registration_fails_with_invalid_email()
    {
        $response = $this->postJson('/api/register', [
            'name'                  => 'Test User',
            'email'                 => 'not-an-email',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    /** @test */
    public function registration_fails_when_passwords_do_not_match()
    {
        $response = $this->postJson('/api/register', [
            'name'                  => 'Test User',
            'email'                 => 'testuser@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'different456',
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    /** @test */
    public function registration_fails_with_duplicate_email()
    {
        // Create existing user first
        User::factory()->create([
            'email' => 'alreadyexists@example.com',
        ]);

        $response = $this->postJson('/api/register', [
            'name'                  => 'Duplicate User',
            'email'                 => 'alreadyexists@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    /** @test */
    public function registration_fails_when_already_authenticated()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/register', [
                'name'                  => 'Another User',
                'email'                 => 'another@example.com',
                'password'              => 'password123',
                'password_confirmation' => 'password123',
            ]);

        $response->assertStatus(403); // or 401/419 depending on middleware
        // If you use 'guest' middleware → should be 403 Forbidden
    }
}
