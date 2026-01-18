<?php

namespace Tests\Unit\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TokenCreationTest extends TestCase
{
    use RefreshDatabase;

    /** @test */
    public function user_can_create_personal_access_token()
    {
        $user = User::factory()->create();

        $tokenRecord = $user->createToken(
            name: 'test-device',
            abilities: ['*'],
            expiresAt: null
        );

        $this->assertNotNull($tokenRecord);
        $this->assertInstanceOf(\Laravel\Sanctum\NewAccessToken::class, $tokenRecord);

        $plainTextToken = $tokenRecord->plainTextToken;
        $this->assertIsString($plainTextToken);
        $this->assertStringContainsString('|', $plainTextToken); // id|token format

        // Check database
        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id'   => $user->id,
            'tokenable_type' => User::class,
            'name'           => 'test-device',
            'abilities'      => json_encode(['*']),
            'expires_at'     => null,
        ]);
    }
}
