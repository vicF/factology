<?php

namespace Tests\Feature;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;

class ExternalLinksTest extends TestCase
{
    use CreatesTestUsers;

    /**
     * Create a Thing for the given user and return its id, acting as the user.
     */
    protected function createThingForUser($user): string
    {
        if (!isset($user->thing_id) || !$user->thing_id) {
            $user->thing_id = $this->createUserThing($user);
            $user->save();
        }

        Sanctum::actingAs($user, ['*']);

        $uuid = uuid_create();
        $response = $this->postJson('/api/v1/object/' . $uuid, [
            'thing_id' => $uuid,
            'name'     => 'Object with external links',
            'type'     => UUID::G_THING,
            'public'   => 1,
            'classes'  => [
                [
                    'one_thing_id'   => $uuid,
                    'link_type_id'   => UUID::LINK_TO_CLASS,
                    'other_thing_id' => UUID::SOMETHING,
                    'public'         => 1,
                ],
            ],
        ]);
        $response->assertOk();

        return $uuid;
    }

    protected function createUserThing($user): string
    {
        $thingId = uuid_create();
        DB::table('things')->insert([
            'thing_id' => $thingId,
            'name'     => $user->name,
            'type'     => UUID::G_THING,
            'public'   => 1,
            'deleted'  => 0,
        ]);
        return $thingId;
    }

    /** @test */
    public function external_links_roundtrip_insert_update_delete()
    {
        $user = $this->createTestUser()->getUser();
        $thingId = $this->createThingForUser($user);

        $basePayload = [
            'thing_id' => $thingId,
            'name'     => 'Object with external links',
            'type'     => UUID::G_THING,
            'public'   => 1,
        ];

        // Insert two links
        $this->putJson('/api/v1/object/' . $thingId, array_merge($basePayload, [
            'external_links' => [
                ['url' => 'https://en.wikipedia.org/wiki/Vodka'],
                ['url' => 'https://vk.com/vodka'],
            ],
        ]))->assertOk();

        $json = $this->getJson('/api/v1/object/' . $thingId)->assertOk()->json('data');
        $this->assertArrayHasKey('external_links', $json);
        $this->assertCount(2, $json['external_links']);
        $this->assertContains('https://en.wikipedia.org/wiki/Vodka', array_column($json['external_links'], 'url'));
        $this->assertContains('https://vk.com/vodka', array_column($json['external_links'], 'url'));

        // Update one link (by id), drop the other
        $firstId = $json['external_links'][0]['id'];
        $this->putJson('/api/v1/object/' . $thingId, array_merge($basePayload, [
            'external_links' => [
                ['id' => $firstId, 'url' => 'https://en.wikipedia.org/wiki/Whisky'],
            ],
        ]))->assertOk();

        $json = $this->getJson('/api/v1/object/' . $thingId)->assertOk()->json('data');
        $this->assertCount(1, $json['external_links']);
        $this->assertSame('https://en.wikipedia.org/wiki/Whisky', $json['external_links'][0]['url']);
        $this->assertSame($firstId, $json['external_links'][0]['id']);

        // Empty list deletes all
        $this->putJson('/api/v1/object/' . $thingId, array_merge($basePayload, [
            'external_links' => [],
        ]))->assertOk();

        $json = $this->getJson('/api/v1/object/' . $thingId)->assertOk()->json('data');
        $this->assertEmpty($json['external_links']);
    }
}
