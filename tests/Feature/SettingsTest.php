<?php

namespace Tests\Feature;

use App\Models\User;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use Laravel\Sanctum\Sanctum;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

class SettingsTest extends TestCase
{
    use SafeRefreshDatabase, CreatesTestUsers;

    protected const API_PREFIX = '/api/v1';

    // ──────────────────────────────────────────────
    //   Registration disabled setting
    // ──────────────────────────────────────────────

    /** @test */
    public function registration_is_enabled_by_default()
    {
        config(['app.registration_enabled' => true]);

        $response = $this->postJson(self::API_PREFIX . '/register', [
            'name'                  => 'New User',
            'email'                 => 'newuser@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertStatus(201);
    }

    /** @test */
    public function registration_is_blocked_when_disabled()
    {
        config(['app.registration_enabled' => false]);

        $response = $this->postJson(self::API_PREFIX . '/register', [
            'name'                  => 'Blocked User',
            'email'                 => 'blocked@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertStatus(403);
        $response->assertJson([
            'success' => false,
            'message' => 'Registration is currently disabled',
        ]);

        // Verify no user was created in the database
        $this->assertDatabaseMissing('users', [
            'email' => 'blocked@example.com',
        ]);
    }

    // ──────────────────────────────────────────────
    //   Public objects visibility setting
    // ──────────────────────────────────────────────

    /** @test */
    public function unauthenticated_users_can_access_objects_when_visibility_is_everyone()
    {
        config(['app.public_objects_visibility' => 'everyone']);

        $response = $this->getJson(self::API_PREFIX . '/object/939cd822-9e23-450c-8c5e-c23f67cca792');

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
        ]);
    }

    /** @test */
    public function unauthenticated_users_are_blocked_when_visibility_is_registered_only()
    {
        config(['app.public_objects_visibility' => 'registered_only']);

        $response = $this->getJson(self::API_PREFIX . '/object/939cd822-9e23-450c-8c5e-c23f67cca792');

        $response->assertStatus(401);
        $response->assertJson([
            'success' => false,
            'message' => 'Authentication required. Please log in.',
        ]);
    }

    /** @test */
    public function authenticated_users_can_access_objects_when_visibility_is_registered_only()
    {
        config(['app.public_objects_visibility' => 'registered_only']);

        $user = $this->createTestUser()->getUser();
        Sanctum::actingAs($user, ['*']);

        $response = $this->getJson(self::API_PREFIX . '/object/939cd822-9e23-450c-8c5e-c23f67cca792');

        $response->assertStatus(200);
    }

    /** @test */
    public function unauthenticated_search_is_blocked_when_visibility_is_registered_only()
    {
        config(['app.public_objects_visibility' => 'registered_only']);

        $response = $this->postJson(self::API_PREFIX . '/object', [
            'search' => 'test',
        ]);

        $response->assertStatus(401);
    }

    // ──────────────────────────────────────────────
    //   Private objects are not visible to anonymous
    // ──────────────────────────────────────────────

    /** @test */
    public function anonymous_users_cannot_see_private_objects()
    {
        config(['app.public_objects_visibility' => 'everyone']);

        // Create a private object (public = false)
        $thingId = uuid_create();
        $ownerThingId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'Private Test Object',
            'description' => 'This should be hidden from anonymous',
            'type'        => UUID::G_THING,
            'owner'       => $ownerThingId,
            'public'      => false,
        ]);

        $response = $this->getJson(self::API_PREFIX . '/object/' . $thingId);

        $response->assertStatus(404);
    }

    /** @test */
    public function owner_can_see_their_own_private_objects()
    {
        config(['app.public_objects_visibility' => 'everyone']);

        $user = $this->createTestUser()->getUser();

        // Create the things record for the user FIRST (FK constraint)
        $userThingId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $userThingId,
            'name'        => 'thing-' . $user->name,
            'type'        => UUID::G_THING,
            'owner'       => uuid_create(),
            'public'      => false,
        ]);

        // Set the user's thing_id to match the things record
        $user->thing_id = $userThingId;
        $user->save();

        // Create a private object owned by this user
        $thingId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'My Private Object',
            'description' => 'Only I should see this',
            'type'        => UUID::G_THING,
            'owner'       => $user->thing_id,
            'public'      => false,
        ]);

        Sanctum::actingAs($user, ['*']);

        $response = $this->getJson(self::API_PREFIX . '/object/' . $thingId);

        $response->assertStatus(200);
        $this->assertEquals('My Private Object', $response->json('data.name'));
    }

    // ──────────────────────────────────────────────
    //   Public field type check (boolean from API)
    // ──────────────────────────────────────────────

    /** @test */
    public function public_field_is_boolean_in_search_response()
    {
        config(['app.public_objects_visibility' => 'everyone']);

        $response = $this->postJson(self::API_PREFIX . '/object', [
            'search' => 'Anything',
        ]);

        $response->assertStatus(200);
        $things = $response->json('things');

        if (!empty($things)) {
            foreach ($things as $thing) {
                $this->assertArrayHasKey('public', $thing, 'Each thing should have a public field');
                $this->assertIsBool($thing['public'],
                    'Public field should be boolean, got ' . gettype($thing['public']) . ' value: ' . json_encode($thing['public']));
            }
        }
    }

    /** @test */
    public function public_field_is_boolean_in_single_object_response()
    {
        config(['app.public_objects_visibility' => 'everyone']);

        $response = $this->getJson(self::API_PREFIX . '/object/939cd822-9e23-450c-8c5e-c23f67cca792');

        $response->assertStatus(200);
        $data = $response->json('data');

        $this->assertArrayHasKey('public', $data);
        $this->assertIsBool($data['public'],
            'Public field should be boolean, got ' . gettype($data['public']));
    }
}
