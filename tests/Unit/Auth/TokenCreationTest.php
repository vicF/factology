<?php

namespace Tests\Unit\Auth;

use App\Models\Classes\UserClass;
use App\Models\User;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

class TokenCreationTest extends TestCase
{
    use SafeRefreshDatabase;
    use CreatesTestUsers;

    /** @test */
    public function user_can_create_personal_access_token()
    {
        $user = $this->createTestUser()->getUser();

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
