<?php

namespace Tests\Feature\Auth;

use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

/**
 * Server-side identity-file login.
 *
 * The client proves possession of an Ed25519 keypair (stored in its identity
 * file) by signing a fresh, single-use server challenge. Public keys are
 * registered to accounts via the auth-protected bind flow.
 */
class IdentityLoginTest extends TestCase
{
    use SafeRefreshDatabase, CreatesTestUsers;

    protected const API_PREFIX = '/api/v1';

    /** @return array{public_b64: string, secret: string} a fresh Ed25519 keypair */
    private function makeKeypair(): array
    {
        $keypair = sodium_crypto_sign_keypair();
        return [
            'public_b64' => sodium_bin2base64(
                sodium_crypto_sign_publickey($keypair),
                SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING
            ),
            'secret' => sodium_crypto_sign_secretkey($keypair),
        ];
    }

    /** @return string base64url signature of $message with the raw secret key */
    private function sign(string $message, string $secret): string
    {
        return sodium_bin2base64(
            sodium_crypto_sign_detached($message, $secret),
            SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING
        );
    }

    /** Create a user whose account already has an identity key bound. */
    private function createUserWithKey(string $publicB64): \App\Models\User
    {
        $userClass = $this->createTestUser();
        $user = $userClass->getUser();
        $user->identity_public_key = $publicB64;
        $user->save();
        return $user;
    }

    /** @test */
    public function challenge_is_rejected_for_unregistered_key()
    {
        ['public_b64' => $public] = $this->makeKeypair();

        $this->postJson(self::API_PREFIX . '/identity/challenge', ['public_key' => $public])
            ->assertStatus(422)
            ->assertJsonValidationErrors('public_key');
    }

    /** @test */
    public function identity_login_returns_a_usable_token()
    {
        ['public_b64' => $public, 'secret' => $secret] = $this->makeKeypair();
        $user = $this->createUserWithKey($public);

        $challenge = $this->postJson(self::API_PREFIX . '/identity/challenge', ['public_key' => $public])
            ->assertStatus(200)
            ->assertJsonStructure(['challenge', 'expires_in'])
            ->json('challenge');

        $signature = $this->sign($challenge, $secret);
        $response = $this->postJson(self::API_PREFIX . '/identity/login', [
            'public_key' => $public,
            'challenge'  => $challenge,
            'signature'  => $signature,
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['user' => ['id', 'name', 'email'], 'token'])
            ->assertJson(['user' => ['id' => $user->id]]);

        // The issued token authenticates against a protected endpoint.
        $token = $response->json('token');
        $this->getJson(self::API_PREFIX . '/user', ['Authorization' => "Bearer $token"])
            ->assertStatus(200)
            ->assertJson(['id' => $user->id]);
    }

    /** @test */
    public function login_rejects_a_wrong_signature_and_consumes_the_challenge()
    {
        ['public_b64' => $public, 'secret' => $secret] = $this->makeKeypair();
        $this->createUserWithKey($public);

        $challenge = $this->postJson(self::API_PREFIX . '/identity/challenge', ['public_key' => $public])
            ->json('challenge');

        // Tampered signature (random 64 bytes) — verification must fail.
        $this->postJson(self::API_PREFIX . '/identity/login', [
            'public_key' => $public,
            'challenge'  => $challenge,
            'signature'  => $this->sign('totally-different-message', $secret),
        ])->assertStatus(422)->assertJsonValidationErrors('signature');

        // A failed attempt consumes the challenge: even the correct signature
        // can no longer log in with it.
        $this->postJson(self::API_PREFIX . '/identity/login', [
            'public_key' => $public,
            'challenge'  => $challenge,
            'signature'  => $this->sign($challenge, $secret),
        ])->assertStatus(422)->assertJsonValidationErrors('challenge');
    }

    /** @test */
    public function a_challenge_is_single_use()
    {
        ['public_b64' => $public, 'secret' => $secret] = $this->makeKeypair();
        $this->createUserWithKey($public);

        $challenge = $this->postJson(self::API_PREFIX . '/identity/challenge', ['public_key' => $public])
            ->json('challenge');

        $this->postJson(self::API_PREFIX . '/identity/login', [
            'public_key' => $public,
            'challenge'  => $challenge,
            'signature'  => $this->sign($challenge, $secret),
        ])->assertStatus(200);

        // Replaying the same challenge must fail now.
        $this->postJson(self::API_PREFIX . '/identity/login', [
            'public_key' => $public,
            'challenge'  => $challenge,
            'signature'  => $this->sign($challenge, $secret),
        ])->assertStatus(422)->assertJsonValidationErrors('challenge');
    }

    /** @test */
    public function bind_flow_registers_a_key_and_enables_identity_login()
    {
        $userClass = $this->createTestUser();
        $user = $userClass->getUser();

        $this->actingAs($user, 'sanctum');

        ['public_b64' => $public, 'secret' => $secret] = $this->makeKeypair();

        $challenge = $this->postJson(self::API_PREFIX . '/identity/bind-challenge', ['public_key' => $public])
            ->assertStatus(200)
            ->json('challenge');

        $this->postJson(self::API_PREFIX . '/identity/bind', [
            'public_key' => $public,
            'challenge'  => $challenge,
            'signature'  => $this->sign($challenge, $secret),
        ])->assertStatus(200)->assertJson(['message' => 'Identity registered']);

        $this->assertDatabaseHas('users', [
            'id'                   => $user->id,
            'identity_public_key'  => $public,
        ]);

        // The freshly bound key can now sign in with the public challenge flow.
        $loginChallenge = $this->postJson(self::API_PREFIX . '/identity/challenge', ['public_key' => $public])
            ->json('challenge');
        $this->postJson(self::API_PREFIX . '/identity/login', [
            'public_key' => $public,
            'challenge'  => $loginChallenge,
            'signature'  => $this->sign($loginChallenge, $secret),
        ])->assertStatus(200)->assertJson(['user' => ['id' => $user->id]]);
    }

    /** @test */
    public function bind_rejects_a_key_already_owned_by_another_account()
    {
        ['public_b64' => $public] = $this->makeKeypair();
        $this->createUserWithKey($public); // owner

        $otherClass = $this->createTestUser();
        $other = $otherClass->getUser();
        $this->actingAs($other, 'sanctum');

        $this->postJson(self::API_PREFIX . '/identity/bind-challenge', ['public_key' => $public])
            ->assertStatus(422)
            ->assertJsonValidationErrors('public_key');
    }

    /** @test */
    public function bind_flow_requires_key_possession()
    {
        $userClass = $this->createTestUser();
        $user = $userClass->getUser();
        $this->actingAs($user, 'sanctum');

        ['public_b64' => $public] = $this->makeKeypair();
        $challenge = $this->postJson(self::API_PREFIX . '/identity/bind-challenge', ['public_key' => $public])
            ->json('challenge');

        // Signature by a different key — possession not proven.
        ['secret' => $wrongSecret] = $this->makeKeypair();
        $this->postJson(self::API_PREFIX . '/identity/bind', [
            'public_key' => $public,
            'challenge'  => $challenge,
            'signature'  => $this->sign($challenge, $wrongSecret),
        ])->assertStatus(422)->assertJsonValidationErrors('signature');

        $this->assertDatabaseMissing('users', [
            'id'                  => $user->id,
            'identity_public_key' => $public,
        ]);
    }

    /** @test */
    public function bind_challenge_requires_authentication()
    {
        ['public_b64' => $public] = $this->makeKeypair();

        $this->postJson(self::API_PREFIX . '/identity/bind-challenge', ['public_key' => $public])
            ->assertStatus(401);
    }
}
