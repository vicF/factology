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
                'token',
                'message',
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

        $response->assertStatus(302);
    }

    // ────────────────────────────────────────────────
    //   NEW TESTS: Login & Logout after registration
    // ────────────────────────────────────────────────

    /** @test */
    public function registered_user_can_login_and_receive_new_token()
    {
        // First register the user
        $this->postJson('/api/register', [
            'name'                  => 'Login Test User',
            'email'                 => 'loginuser@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        // Now attempt to login
        $response = $this->postJson('/api/login', [
            'email'    => 'loginuser@example.com',
            'password' => 'password123',
        ]);

        $response
            ->assertStatus(200)
            ->assertJsonStructure([
                'user' => [
                    'id',
                    'name',
                    'email',
                ],
                'token',
                'message',
            ])
            ->assertJson([
                'message' => 'Login successful', // adjust if your message is different
            ]);

        $user = User::where('email', 'loginuser@example.com')->first();
        $this->assertNotNull($user);
        $this->assertGreaterThanOrEqual(1, $user->tokens()->count());
    }

    /** @test */
    public function registered_user_can_logout_and_token_is_revoked()
    {
        // Register user
        $registerResponse = $this->postJson('/api/register', [
            'name'                  => 'Logout Test User',
            'email'                 => 'logoutuser@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $token = $registerResponse->json('token');

        // Make sure we have a valid token
        $this->assertNotEmpty($token);

        // Logout using the token
        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson('/api/logout');

        $response
            ->assertStatus(200)
            ->assertJson([
                'message' => 'Logged out', // adjust to match your actual message
            ]);

        // Verify token was revoked
        $user = User::where('email', 'logoutuser@example.com')->first();
        $this->assertNotNull($user);
        $this->assertCount(0, $user->tokens);

        // Try to use the token again → should be 401
        $protectedResponse = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->getJson('/api/user');

        $protectedResponse->assertStatus(401);
    }

    /** @test */
    public function logout_fails_without_authentication()
    {
        $response = $this->postJson('/api/logout');

        $response->assertStatus(401);
    }
}
