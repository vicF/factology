<?php

namespace Tests\Feature;

use App\Models\Classes\Everything;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;

/**
 * Links are stored as directed triples, but a given (endpoint pair, type) should
 * exist at most once regardless of direction. These tests guard the reverse-dedup
 * in both write paths (ApiController::storeLink and Everything::addLink).
 */
class LinkReverseDedupTest extends TestCase
{
    use CreatesTestUsers;

    protected function setUp(): void
    {
        parent::setUp();

        // The test DB is not seeded with every system link type. Ensure the
        // PRESENT ("is involved in") link type exists so links can reference it.
        if (!DB::table('things')->where('thing_id', UUID::PRESENT)->exists()) {
            DB::table('things')->insert([
                'thing_id'    => UUID::PRESENT,
                'name'        => 'is involved in',
                'type'        => UUID::G_LINK,
                'public'      => 1,
                'deleted'     => 0,
                'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
            ]);
        }
    }

    protected function createThing(string $name, string $ownerThingId): string
    {
        $thingId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => $name,
            'type'        => UUID::G_THING,
            'owner'       => $ownerThingId,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
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

    protected function assertSingleLink(string $a, string $b): void
    {
        $count = DB::table('links')
            ->where('link_type_id', UUID::PRESENT)
            ->where(function ($q) use ($a, $b) {
                $q->where('one_thing_id', $a)->where('other_thing_id', $b)
                    ->orWhere('one_thing_id', $b)->where('other_thing_id', $a);
            })
            ->count();
        $this->assertSame(1, $count);
    }

    /** @test */
    public function store_link_reuses_existing_link_when_reverse_is_added()
    {
        $owner = $this->actingUserThing();
        $a = $this->createThing('Reverse dedup A', $owner);
        $b = $this->createThing('Reverse dedup B', $owner);

        // A -> PRESENT -> B
        $this->postJson('/api/v1/link', [
            'one_thing_id'   => $a,
            'other_thing_id' => $b,
            'link_type_id'   => UUID::PRESENT,
        ])->assertOk();

        // Reverse B -> PRESENT -> A must reuse the existing row, not duplicate.
        $this->postJson('/api/v1/link', [
            'one_thing_id'   => $b,
            'other_thing_id' => $a,
            'link_type_id'   => UUID::PRESENT,
        ])->assertOk();

        $this->assertSingleLink($a, $b);

        // The surviving row keeps its original direction.
        $this->assertDatabaseHas('links', [
            'one_thing_id'   => $a,
            'other_thing_id' => $b,
            'link_type_id'   => UUID::PRESENT,
        ]);
    }

    /** @test */
    public function store_link_reuses_existing_link_for_the_same_direction()
    {
        $owner = $this->actingUserThing();
        $a = $this->createThing('Reverse dedup C', $owner);
        $b = $this->createThing('Reverse dedup D', $owner);

        $payload = [
            'one_thing_id'   => $a,
            'other_thing_id' => $b,
            'link_type_id'   => UUID::PRESENT,
        ];
        $this->postJson('/api/v1/link', $payload)->assertOk();
        $this->postJson('/api/v1/link', $payload)->assertOk();

        $this->assertSingleLink($a, $b);
    }

    /** @test */
    public function add_link_reuses_existing_link_when_reverse_is_added()
    {
        $owner = $this->actingUserThing();
        $a = $this->createThing('Reverse dedup E', $owner);
        $b = $this->createThing('Reverse dedup F', $owner);

        $model = new Everything(['thing_id' => $a]);
        $model->addLink([
            'one_thing_id'   => $a,
            'other_thing_id' => $b,
            'link_type_id'   => UUID::PRESENT,
        ]);
        $model->addLink([
            'one_thing_id'   => $b,
            'other_thing_id' => $a,
            'link_type_id'   => UUID::PRESENT,
        ]);

        $this->assertSingleLink($a, $b);
    }
}
