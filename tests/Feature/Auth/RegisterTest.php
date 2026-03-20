<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Tests\TestCase;
use Tests\Traits\SafeRefreshDatabase;
use PHPUnit\Framework\Attributes\Test;

class RegisterTest extends TestCase
{
    use SafeRefreshDatabase;

    protected const API_PREFIX = '/api/v1';

    #[Test]
    public function user_can_register_with_valid_data_and_receive_token(): void
    {
        $response = $this->postJson(self::API_PREFIX . '/register', [
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

    #[Test]
    public function registration_fails_with_missing_name(): void
    {
        $response = $this->postJson(self::API_PREFIX . '/register', [
            'email'                 => 'testuser@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name']);
    }

    #[Test]
    public function registration_fails_with_invalid_email(): void
    {
        $response = $this->postJson(self::API_PREFIX . '/register', [
            'name'                  => 'Test User',
            'email'                 => 'not-an-email',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    #[Test]
    public function registration_fails_when_passwords_do_not_match(): void
    {
        $response = $this->postJson(self::API_PREFIX . '/register', [
            'name'                  => 'Test User',
            'email'                 => 'testuser@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'different456',
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['password']);
    }

    #[Test]
    public function registration_fails_with_duplicate_email(): void
    {
        // Create existing user first
        User::factory()->create([
            'email' => 'alreadyexists@example.com',
        ]);

        $response = $this->postJson(self::API_PREFIX . '/register', [
            'name'                  => 'Duplicate User',
            'email'                 => 'alreadyexists@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    #[Test]
    public function registration_fails_when_already_authenticated(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')
            ->postJson(self::API_PREFIX . '/register', [
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

    #[Test]
    public function registered_user_can_login_and_receive_new_token(): void
    {
        // First register the user
        $this->postJson(self::API_PREFIX . '/register', [
            'name'                  => 'Login Test User',
            'email'                 => 'loginuser@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        // Now attempt to login
        $response = $this->postJson(self::API_PREFIX . '/login', [
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

    #[Test]
    public function registered_user_can_logout_and_token_is_revoked(): void
    {
        // Register user
        $registerResponse = $this->postJson(self::API_PREFIX . '/register', [
            'name'                  => 'Logout Test User',
            'email'                 => 'logoutuser@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $token = $registerResponse->json('token');
        $this->assertNotEmpty($token, 'Token should be returned on registration');

        // Get user ID from response or DB
        $user = User::where('email', 'logoutuser@example.com')->first();
        $this->assertNotNull($user);
        $initialTokenCount = $user->tokens()->count();
        $this->assertGreaterThan(0, $initialTokenCount, 'At least one token should exist after register');

        // Logout
        $logoutResponse = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson(self::API_PREFIX . '/logout');

        $logoutResponse
            ->assertStatus(200)
            ->assertJson(['message' => 'Logged out']);

        // Refresh user relationship
        $user->refresh();

        // Debug: how many tokens remain?
        $remainingTokens = $user->tokens()->get();
        $this->assertCount(0, $remainingTokens, 'All tokens should be deleted after logout. Found: ' . $remainingTokens->count());

        // Try protected route again with the same token
        $protectedResponse = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->getJson(self::API_PREFIX . '/user');

        // This is the failing assertion - keep it
        $protectedResponse->assertStatus(401, 'Protected route should return 401 after token revocation');

        // Extra debug info if it still fails
        if ($protectedResponse->status() !== 401) {
            dump([
                'response_status' => $protectedResponse->status(),
                'response_body'   => $protectedResponse->json(),
                'token_used'      => substr($token, 0, 10) . '...',
                'user_tokens_after_logout' => $user->tokens()->pluck('id')->toArray(),
            ]);
        }
    }

    #[Test]
    public function logout_fails_without_authentication(): void
    {
        $response = $this->postJson(self::API_PREFIX . '/logout');

        $response->assertStatus(401);
    }
}
