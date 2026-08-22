<?php

namespace Tests\Feature;

use App\Models\User;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;

/**
 * Objects created with a start date in the future are auto-marked "planned"
 * (things.data.planned). The owner (or an admin) confirms they happened via
 * PATCH /object/{id}/confirm, which records data.confirmed.
 */
class PlannedConfirmTest extends TestCase
{
    use CreatesTestUsers;

    protected function createThing(string $name, string $ownerThingId, array $extra = []): string
    {
        $thingId = uuid_create();
        DB::table('things')->insert(array_merge([
            'thing_id'    => $thingId,
            'name'        => $name,
            'type'        => UUID::G_THING,
            'owner'       => $ownerThingId,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ], $extra));
        return $thingId;
    }

    protected function createUserThing($user): string
    {
        $thingId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => $user->name,
            'type'        => UUID::G_THING,
            'owner'       => $thingId,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
        return $thingId;
    }

    protected function actingUserThing(): string
    {
        $user = $this->createTestUser()->getUser();
        if (!$user->thing_id) {
            $user->thing_id = $this->createUserThing($user);
            $user->save();
        }
        Sanctum::actingAs($user, ['*']);
        return $user->thing_id;
    }

    protected function createAdminUser(): User
    {
        $userClass = $this->createTestUser([
            'name'  => 'Admin User',
            'email' => 'admin_planned_test@example.com',
        ]);
        $user = $userClass->getUser();
        $user->is_admin = true;
        $user->save();
        return $user;
    }

    protected function createObjectPayload(string $thingId, string $start): array
    {
        return [
            'thing_id'    => $thingId,
            'name'        => 'Planned event ' . $thingId,
            'type'        => UUID::G_THING,
            'description' => 'test',
            'start'       => $start,
            'end'         => null,
            'public'      => 1,
            'data'        => [],
        ];
    }

    /** @test */
    public function future_dated_object_is_auto_marked_planned_on_create()
    {
        $owner = $this->actingUserThing();
        $thingId = uuid_create();

        $future = date('Ymd', strtotime('+30 days'));
        $this->postJson('/api/v1/object/' . $thingId, $this->createObjectPayload($thingId, $future))
            ->assertOk();

        $row = DB::table('things')->where('thing_id', $thingId)->first();
        $data = json_decode($row->data, true);
        $this->assertNotEmpty($data['planned'] ?? null, 'future-dated object should be marked planned');
    }

    /** @test */
    public function past_dated_object_is_not_marked_planned_on_create()
    {
        $owner = $this->actingUserThing();
        $thingId = uuid_create();

        $past = date('Ymd', strtotime('-30 days'));
        $this->postJson('/api/v1/object/' . $thingId, $this->createObjectPayload($thingId, $past))
            ->assertOk();

        $row = DB::table('things')->where('thing_id', $thingId)->first();
        $data = json_decode($row->data, true) ?: [];
        $this->assertArrayNotHasKey('planned', $data);
    }

    /** @test */
    public function owner_confirms_a_planned_object()
    {
        $owner = $this->actingUserThing();
        $thingId = $this->createThing('Planned gig', $owner, [
            'data' => json_encode(['planned' => '2026-08-20']),
        ]);

        $this->patchJson('/api/v1/object/' . $thingId . '/confirm')
            ->assertOk()
            ->assertJson([
                'success' => true,
            ]);

        $row = DB::table('things')->where('thing_id', $thingId)->first();
        $data = json_decode($row->data, true);
        $this->assertSame('2026-08-20', $data['planned'] ?? null, 'planned date is preserved');
        $this->assertNotEmpty($data['confirmed'] ?? null, 'confirmation date is recorded');
    }

    /** @test */
    public function non_owner_cannot_confirm_someone_elses_object()
    {
        $owner = $this->actingUserThing();
        $thingId = $this->createThing('Someone else\'s plan', $owner, [
            'data' => json_encode(['planned' => '2026-08-20']),
        ]);

        // Act as a different user.
        $other = $this->createTestUser()->getUser();
        if (!$other->thing_id) {
            $other->thing_id = $this->createUserThing($other);
            $other->save();
        }
        Sanctum::actingAs($other, ['*']);

        $this->patchJson('/api/v1/object/' . $thingId . '/confirm')
            ->assertStatus(403);

        $row = DB::table('things')->where('thing_id', $thingId)->first();
        $data = json_decode($row->data, true);
        $this->assertArrayNotHasKey('confirmed', $data);
    }

    /** @test */
    public function admin_can_confirm_any_object()
    {
        $owner = $this->actingUserThing();
        $thingId = $this->createThing('Admin-confirmed plan', $owner, [
            'data' => json_encode(['planned' => '2026-08-20']),
        ]);

        $admin = $this->createAdminUser();
        Sanctum::actingAs($admin, ['*']);

        $this->patchJson('/api/v1/object/' . $thingId . '/confirm')->assertOk();

        $row = DB::table('things')->where('thing_id', $thingId)->first();
        $data = json_decode($row->data, true);
        $this->assertNotEmpty($data['confirmed'] ?? null);
    }
}
