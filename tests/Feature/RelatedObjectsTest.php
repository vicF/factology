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
 * Multilevel related objects: `depth` on POST /object (search) and
 * GET /object/{id} (detail), resolved by App\Services\RelatedObjectsResolver.
 */
class RelatedObjectsTest extends TestCase
{
    use CreatesTestUsers;
    use SafeRefreshDatabase;

    /** A custom (non-system) link type, created in setUp. */
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

    private function createUserThing(User $user): string
    {
        $thingId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'thing-' . $user->name,
            'description' => 'Things record for user ' . $user->email,
            'type'        => UUID::G_THING,
            'owner'       => $thingId,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
        return $thingId;
    }

    private function actingOwner(): string
    {
        $user = $this->createTestUser()->getUser();
        if (!$user->thing_id) {
            $user->thing_id = $this->createUserThing($user);
            $user->save();
        }
        Sanctum::actingAs($user, ['*']);
        return $user->thing_id;
    }

    private function createThing(string $name, string $ownerThingId, array $overrides = []): string
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
        ], $overrides));
        return $thingId;
    }

    private function createLink(string $one, string $other, ?float $linkStart = null): void
    {
        DB::table('links')->insert([
            'one_thing_id'   => $one,
            'other_thing_id' => $other,
            'link_type_id'   => $this->linkTypeId,
            'public'         => 1,
            'deleted'        => 0,
            'link_start'     => $linkStart,
            'link_uuid'      => (string) Str::uuid(),
        ]);
    }

    private function search(string $term, array $body = []): array
    {
        $res = $this->postJson('/api/v1/object', array_merge(['search' => $term], $body));
        $res->assertStatus(200);
        return $res->json('things');
    }

    private function getDetail(string $id, int $depth = 0): array
    {
        $url = '/api/v1/object/' . $id . ($depth > 0 ? '?depth=' . $depth : '');
        $res = $this->getJson($url);
        $res->assertStatus(200);
        return $res->json('data');
    }

    /** Max nesting depth of `target.links` starting from a links array. */
    private function maxNestingDepth(array $links): int
    {
        $max = 0;
        foreach ($links as $link) {
            $child = $link['target']['links'] ?? null;
            if (is_array($child)) {
                $max = max($max, 1 + $this->maxNestingDepth($child));
            }
        }
        return $max;
    }

    /** @test */
    public function search_attaches_direct_related_by_default()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Search Target', $owner);
        $b = $this->createThing('Bravo Related', $owner);
        $c = $this->createThing('Charlie Related', $owner);
        $this->createLink($a, $b);
        $this->createLink($a, $c);

        $things = $this->search('Alpha Search Target');

        $this->assertCount(1, $things);
        $links = $things[0]['links'] ?? null;
        $this->assertNotNull($links, 'search result should carry `links` by default (depth 1)');
        $this->assertCount(2, $links);

        $targetIds = array_column(array_column($links, 'target'), 'thing_id');
        sort($targetIds);
        $expected = [$b, $c];
        sort($expected);
        $this->assertEquals($expected, $targetIds);

        foreach ($links as $link) {
            $this->assertNotEmpty($link['target']['name']);
            $this->assertEquals(UUID::G_THING, $link['target']['type']);
            $this->assertTrue($link['target']['public']);
            // depth 1 → shallow target, no nested links
            $this->assertArrayNotHasKey('links', $link['target']);
        }
    }

    /** @test */
    public function search_depth_zero_disables_related_links()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Depth Zero', $owner);
        $b = $this->createThing('Bravo Depth Zero', $owner);
        $this->createLink($a, $b);

        $things = $this->search('Alpha Depth Zero', ['depth' => 0]);

        $this->assertArrayNotHasKey('links', $things[0]);
    }

    /** @test */
    public function detail_with_depth_returns_nested_related_tree()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Nested', $owner);
        $b = $this->createThing('Bravo Nested', $owner);
        $c = $this->createThing('Charlie Nested', $owner);
        $this->createLink($a, $b);
        $this->createLink($b, $c);

        $detail = $this->getDetail($a, 2);

        $this->assertCount(1, $detail['links']);
        $first = $detail['links'][0];
        $this->assertEquals($b, $first['target']['thing_id']);
        // depth 2 → the target's own related objects are nested under target.links
        $this->assertNotEmpty($first['target']['links']);
        $this->assertEquals($c, $first['target']['links'][0]['target']['thing_id']);
    }

    /** @test */
    public function detail_without_depth_is_unchanged()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Flat', $owner);
        $b = $this->createThing('Bravo Flat', $owner);
        $this->createLink($a, $b);

        $detail = $this->getDetail($a);

        $this->assertCount(1, $detail['links']);
        $link = $detail['links'][0];
        // flat fields preserved (backward compat)
        $this->assertNotNull($link['link_id']);
        $this->assertEquals($a, $link['one_thing_id']);
        $this->assertEquals($b, $link['other_thing_id']);
        $this->assertEquals($this->linkTypeId, $link['link_type_id']);
        $this->assertNotNull($link['name']);
        $this->assertNotNull($link['link_name']);
        // no nested target unless depth requested
        $this->assertArrayNotHasKey('target', $link);
    }

    /** @test */
    public function depth_is_capped_at_six_levels()
    {
        $owner = $this->actingOwner();
        $ids = [];
        for ($i = 0; $i < 9; $i++) {
            $ids[] = $this->createThing('Chain Node ' . $i, $owner);
        }
        for ($i = 0; $i < 8; $i++) {
            $this->createLink($ids[$i], $ids[$i + 1]);
        }

        $detail = $this->getDetail($ids[0], 99);

        $this->assertLessThanOrEqual(6, $this->maxNestingDepth($detail['links']));
    }

    /** @test */
    public function cycles_are_deduped_to_lowest_level()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Cycle', $owner);
        $b = $this->createThing('Bravo Cycle', $owner);
        $c = $this->createThing('Charlie Cycle', $owner);
        // Triangle A-B-C plus an A->C chord — every thing reachable via many paths.
        $this->createLink($a, $b);
        $this->createLink($b, $c);
        $this->createLink($a, $c);

        $detail = $this->getDetail($a, 4);

        // A appears once, with B and C as direct targets.
        $targetIds = array_column(array_column($detail['links'], 'target'), 'thing_id');
        sort($targetIds);
        $expected = [$b, $c];
        sort($expected);
        $this->assertEquals($expected, $targetIds);

        // B's deeper links are cut (both A and C are already visited at level 1);
        // B is a recursed node, so it carries an empty target.links.
        $bLink = collect($detail['links'])->firstWhere('target.thing_id', $b);
        $this->assertArrayHasKey('links', $bLink['target']);
        $this->assertSame([], $bLink['target']['links']);

        // No runaway recursion — bounded response.
        $this->assertLessThanOrEqual(2, $this->maxNestingDepth($detail['links']));
    }

    /** @test */
    public function related_are_ranked_by_richness_then_recency_then_name()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Ranked', $owner);
        $rich = $this->createThing('Rich Object', $owner, ['description' => 'has a description']);
        $plain = $this->createThing('Plain Object', $owner);

        $richId = $rich;
        $plainId = $plain;

        $this->createLink($a, $plainId);
        $this->createLink($a, $richId);

        $things = $this->search('Alpha Ranked');
        $targetIds = array_column(array_column($things[0]['links'], 'target'), 'thing_id');

        // Rich object (has description) must come before the plain one.
        $this->assertEquals([$richId, $plainId], $targetIds);
    }

    /** @test */
    public function recency_tiebreak_prefers_newer_link_start()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Dated', $owner);
        $older = $this->createThing('Older Object', $owner);
        $newer = $this->createThing('Newer Object', $owner);

        $this->createLink($a, $older, 202001010000000000.0);
        $this->createLink($a, $newer, 202101010000000000.0);

        $things = $this->search('Alpha Dated');
        $targetIds = array_column(array_column($things[0]['links'], 'target'), 'thing_id');

        $this->assertEquals([$newer, $older], $targetIds);
    }

    /** @test */
    public function search_breadth_is_capped()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Breadth', $owner);
        $linked = [];
        for ($i = 0; $i < 10; $i++) {
            $linked[] = $this->createThing('Breadth Object ' . $i, $owner);
            $this->createLink($a, $linked[$i]);
        }

        $things = $this->search('Alpha Breadth');

        $this->assertLessThanOrEqual(5, count($things[0]['links']));
    }

    /** @test */
    public function detail_breadth_is_capped_at_deeper_levels()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Deep Breadth', $owner);
        $b = $this->createThing('Bravo Deep Breadth', $owner);
        $this->createLink($a, $b);

        $grand = [];
        for ($i = 0; $i < 12; $i++) {
            $grand[] = $this->createThing('Grandchild ' . $i, $owner);
            $this->createLink($b, $grand[$i]);
        }

        $detail = $this->getDetail($a, 2);

        $bLink = collect($detail['links'])->firstWhere('target.thing_id', $b);
        $this->assertLessThanOrEqual(8, count($bLink['target']['links']));
    }

    /** @test */
    public function invisible_related_objects_are_excluded()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Visible', $owner);
        $visible = $this->createThing('Visible Related', $owner);
        $this->createLink($a, $visible);

        // A private object owned by someone else — must not leak into related.
        $strangerThing = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $strangerThing,
            'name'        => 'Stranger Owner',
            'type'        => UUID::G_THING,
            'owner'       => $strangerThing,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
        $private = $this->createThing('Secret Private Object', $strangerThing, ['public' => 0]);
        $this->createLink($a, $private);

        $things = $this->search('Alpha Visible');
        $targetIds = array_column(array_column($things[0]['links'], 'target'), 'thing_id');

        $this->assertContains($visible, $targetIds);
        $this->assertNotContains($private, $targetIds);
    }

    /** @test */
    public function class_membership_links_are_excluded_from_related()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Class', $owner);
        $b = $this->createThing('Bravo Class', $owner);
        $this->createLink($a, $b);

        // Attach a class link — must NOT appear in related objects.
        $classId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $classId,
            'name'        => 'Some Class',
            'type'        => UUID::G_CLASS,
            'owner'       => $owner,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
        DB::table('links')->insert([
            'one_thing_id'   => $a,
            'other_thing_id' => $classId,
            'link_type_id'   => UUID::LINK_TO_CLASS,
            'public'         => 1,
            'deleted'        => 0,
            'link_uuid'      => (string) Str::uuid(),
        ]);

        $things = $this->search('Alpha Class');
        $targetIds = array_column(array_column($things[0]['links'], 'target'), 'thing_id');

        $this->assertContains($b, $targetIds);
        $this->assertNotContains($classId, $targetIds);
    }

    /** @test */
    public function incoming_links_resolve_the_other_endpoint()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Incoming', $owner);
        $b = $this->createThing('Bravo Incoming', $owner);

        // Store the link with A on the other side (incoming direction).
        $this->createLink($b, $a);

        $things = $this->search('Alpha Incoming');
        $links = $things[0]['links'];

        $this->assertCount(1, $links);
        // The target must be B (the other endpoint), and the name must be B's.
        $this->assertEquals($b, $links[0]['target']['thing_id']);
        $this->assertEquals('Bravo Incoming', $links[0]['target']['name']);
    }

    /** @test */
    public function flat_links_remain_backward_compatible_on_detail()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Backward', $owner);
        $b = $this->createThing('Bravo Backward', $owner);
        $this->createLink($a, $b);

        $detail = $this->getDetail($a, 2);

        $link = $detail['links'][0];
        // Flat fields present AND the additive target present at depth 2.
        $this->assertEquals($b, $link['other_thing_id']);
        $this->assertNotNull($link['link_name']);
        $this->assertEquals($b, $link['target']['thing_id']);
    }

    /** @test */
    public function target_carries_geo_for_coordinate_properties()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Geo', $owner);
        $b = $this->createThing('Bravo Geo', $owner, [
            'data' => json_encode([
                'properties' => [
                    'prop-1' => ['lat' => 55.7558, 'lng' => 37.6173],
                    'prop-2' => ['value' => 'not geo'],
                ],
            ]),
        ]);
        $c = $this->createThing('Charlie Geo', $owner);
        $this->createLink($a, $b);
        $this->createLink($a, $c);

        $detail = $this->getDetail($a, 1);

        $bLink = collect($detail['links'])->firstWhere('target.thing_id', $b);
        $this->assertEquals(
            [
                [
                    'geometry'    => ['type' => 'Point', 'coordinates' => [37.6173, 55.7558]],
                    'property_id' => 'prop-1',
                ],
            ],
            $bLink['target']['geo']
        );

        // A target without coordinates gets an empty array.
        $cLink = collect($detail['links'])->firstWhere('target.thing_id', $c);
        $this->assertSame([], $cLink['target']['geo']);
    }

    /** @test */
    public function root_detail_payload_carries_geo()
    {
        $owner = $this->actingOwner();
        $a = $this->createThing('Alpha Root Geo', $owner, [
            'data' => json_encode([
                'properties' => [
                    'prop-1' => ['lat' => 48.8566, 'lng' => 2.3522],
                ],
            ]),
        ]);

        $detail = $this->getDetail($a);

        $this->assertEquals(
            [
                [
                    'geometry'    => ['type' => 'Point', 'coordinates' => [2.3522, 48.8566]],
                    'property_id' => 'prop-1',
                ],
            ],
            $detail['geo']
        );
    }
}
