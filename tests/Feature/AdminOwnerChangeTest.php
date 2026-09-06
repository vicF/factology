<?php

namespace Tests\Feature;

use App\Models\User;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

class AdminOwnerChangeTest extends TestCase
{
    use SafeRefreshDatabase, CreatesTestUsers;

    protected const API_PREFIX = '/api/v1';

    /** @test */
    public function non_admin_cannot_change_owner()
    {
        $user = $this->createTestUser()->getUser();
        $user->thing_id = $this->createUserThing($user);
        $user->save();
        Sanctum::actingAs($user, ['*']);

        $thingId = $this->insertThing('My Thing', $user->thing_id, true);

        $response = $this->putJson(self::API_PREFIX . '/object/' . $thingId, [
            'thing_id' => $thingId,
            'name'     => 'My Thing',
            'public'   => 1,
            'type'     => UUID::G_THING,
            'owner'    => UUID::SYSTEM_OWNER,
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseHas('things', ['thing_id' => $thingId, 'owner' => $user->thing_id]);
    }

    /** @test */
    public function admin_can_change_owner()
    {
        $admin = $this->createAdminUser();
        $admin->thing_id = $this->createUserThing($admin);
        $admin->save();
        Sanctum::actingAs($admin, ['*']);

        $thingId = $this->insertThing('Reassigned Thing', uuid_create(), true);

        $response = $this->putJson(self::API_PREFIX . '/object/' . $thingId, [
            'thing_id' => $thingId,
            'name'     => 'Reassigned Thing',
            'public'   => 1,
            'type'     => UUID::G_THING,
            'owner'    => UUID::SYSTEM_OWNER,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('things', ['thing_id' => $thingId, 'owner' => UUID::SYSTEM_OWNER]);
    }

    /** @test */
    public function admin_can_save_object_they_do_not_own()
    {
        $admin = $this->createAdminUser();
        $admin->thing_id = $this->createUserThing($admin);
        $admin->save();
        Sanctum::actingAs($admin, ['*']);

        $thingId = $this->insertThing('Others Thing', uuid_create(), true);

        $response = $this->putJson(self::API_PREFIX . '/object/' . $thingId, [
            'thing_id' => $thingId,
            'name'     => 'Others Thing Updated',
            'public'   => 1,
            'type'     => UUID::G_THING,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('things', ['thing_id' => $thingId, 'name' => 'Others Thing Updated']);
    }

    /** @test */
    public function non_admin_cannot_save_others_object()
    {
        $user = $this->createTestUser()->getUser();
        $user->thing_id = $this->createUserThing($user);
        $user->save();
        Sanctum::actingAs($user, ['*']);

        $thingId = $this->insertThing('Others Thing', uuid_create(), true);

        $response = $this->putJson(self::API_PREFIX . '/object/' . $thingId, [
            'thing_id' => $thingId,
            'name'     => 'Hijack',
            'public'   => 1,
            'type'     => UUID::G_THING,
        ]);

        $response->assertStatus(403);
    }

    /** @test */
    public function admin_can_toggle_visibility_of_any_object()
    {
        $admin = $this->createAdminUser();
        $admin->thing_id = $this->createUserThing($admin);
        $admin->save();
        Sanctum::actingAs($admin, ['*']);

        $thingId = $this->insertThing('System Thing', UUID::SYSTEM_OWNER, false);

        $response = $this->patchJson(self::API_PREFIX . '/object/' . $thingId . '/visibility', [
            'public' => 1,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('things', ['thing_id' => $thingId, 'public' => true]);
    }

    // ──────────────────────────────────────────────
    //   Helpers
    // ──────────────────────────────────────────────

    private function createAdminUser(): User
    {
        $userClass = $this->createTestUser([
            'name'  => 'Admin User',
            'email' => 'admin_owner_test@example.com',
        ]);
        $user = $userClass->getUser();
        $user->is_admin = true;
        $user->save();
        return $user;
    }

    private function createUserThing(User $user): string
    {
        $thingId = uuid_create();
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'thing-' . $user->name,
            'description' => 'Things record for user ' . $user->email,
            'type'        => 3,
            'owner'       => $thingId,
            'public'      => false,
            'server_uuid' => $serverUuid,
        ]);
        return $thingId;
    }

    private function insertThing(string $name, string $owner, bool $public): string
    {
        $thingId = uuid_create();
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => $name,
            'type'        => UUID::G_THING,
            'public'      => $public,
            'owner'       => $owner,
            'server_uuid' => $serverUuid,
        ]);
        return $thingId;
    }
}
