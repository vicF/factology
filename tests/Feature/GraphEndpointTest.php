<?php

namespace Tests\Feature;

use App\Models\User;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

/**
 * GET /object/{id}/graph — the Graph tab payload: the displayed node set plus
 * EVERY link between displayed objects (cross-links the nested view prunes).
 */
class GraphEndpointTest extends TestCase
{
    use CreatesTestUsers;
    use SafeRefreshDatabase;

    private string $linkTypeId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->linkTypeId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $this->linkTypeId,
            'name'        => 'is related to',
            'type'        => UUID::G_LINK,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
    }

    private function actingOwner(): string
    {
        $user = $this->createTestUser()->getUser();
        if (!$user->thing_id) {
            $thingId = uuid_create();
            DB::table('things')->insert([
                'thing_id'    => $thingId,
                'name'        => 'thing-' . $user->name,
                'type'        => UUID::G_THING,
                'owner'       => $thingId,
                'public'      => 1,
                'deleted'     => 0,
                'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
            ]);
            $user->thing_id = $thingId;
            $user->save();
        }
        Sanctum::actingAs($user, ['*']);
        return $user->thing_id;
    }

    private function createThing(string $name, string $owner): string
    {
        $thingId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => $name,
            'type'        => UUID::G_THING,
            'owner'       => $owner,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
        return $thingId;
    }

    private function createLink(string $one, string $other): void
    {
        DB::table('links')->insert([
            'one_thing_id'   => $one,
            'other_thing_id' => $other,
            'link_type_id'   => $this->linkTypeId,
            'public'         => 1,
            'deleted'        => 0,
            'link_uuid'      => (string) Str::uuid(),
        ]);
    }

    public function test_graph_returns_every_link_between_displayed_nodes()
    {
        $owner = $this->actingOwner();
        $root = $this->createThing('Root', $owner);
        $b = $this->createThing('Rel B', $owner);
        $c = $this->createThing('Rel C', $owner);
        $this->createLink($root, $b);
        $this->createLink($root, $c);
        $this->createLink($b, $c); // cross-link between two displayed relatives

        $res = $this->getJson('/api/v1/object/' . $root . '/graph?depth=1');
        $res->assertStatus(200);

        $data = $res->json('data');
        $this->assertEquals($root, $data['root_id']);
        $nodeIds = array_column($data['nodes'], 'thing_id');
        $this->assertEqualsCanonicalizing([$root, $b, $c], $nodeIds);

        // The spanning tree only has root→B, root→C; the graph must add B→C.
        $edgePairs = array_map(
            fn ($e) => [$e['one_thing_id'], $e['other_thing_id']],
            $data['edges']
        );
        $this->assertCount(3, $edgePairs);
        $this->assertContains([$b, $c], $edgePairs);

        // Node metadata carries names and a class slot for the circle styling.
        $this->assertEquals('Root', $data['nodes'][0]['name']);
        $this->assertArrayHasKey('class', $data['nodes'][0]);
    }

    public function test_graph_ignores_class_membership_links()
    {
        $owner = $this->actingOwner();
        $root = $this->createThing('Root', $owner);
        $cls = $this->createThing('Human', $owner);
        // Class membership: root IS_A Human.
        DB::table('links')->insert([
            'one_thing_id'   => $root,
            'other_thing_id' => $cls,
            'link_type_id'   => UUID::LINK_TO_CLASS,
            'public'         => 1,
            'deleted'        => 0,
            'link_uuid'      => (string) Str::uuid(),
        ]);

        $res = $this->getJson('/api/v1/object/' . $root . '/graph?depth=1');
        $res->assertStatus(200);
        $data = $res->json('data');
        $this->assertEmpty($data['edges']);
    }
}
