<?php

namespace Tests\Feature;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use Tests\Traits\SafeRefreshDatabase;

class ModelTypeTest extends TestCase
{
    use SafeRefreshDatabase;

    /** @test */
    public function general_types_has_model_type()
    {
        $this->assertDatabaseHas('general_types', ['id' => 7, 'name' => 'MODEL']);
    }

    /** @test */
    public function seeded_models_are_type_7_and_keep_their_kind_parent()
    {
        $opel = DB::table('things')->where('thing_id', '5a0f67ea-a290-4ef6-9ac5-0e85d967c4f9')->first();
        $this->assertNotNull($opel, 'Opel Zafira B model should be seeded');
        $this->assertSame(7, (int) $opel->type);
        $this->assertSame('Opel Zafira B', $opel->name);

        // A model is a leaf of the class tree: its parent ("is a superclass of"
        // edge) is still a kind class — here Car.
        $parentName = DB::table('links as l')
            ->join('things as p', 'p.thing_id', '=', 'l.one_thing_id')
            ->where('l.link_type_id', UUID::LINK_TO_PARENT)
            ->where('l.other_thing_id', '5a0f67ea-a290-4ef6-9ac5-0e85d967c4f9')
            ->where('l.deleted', false)
            ->value('p.name');

        $this->assertSame('Car', $parentName);
    }

    /** @test */
    public function search_tree_contains_model_nodes()
    {
        // searchTree() is reachable via POST /api/v1/object with {"tree": true}.
        $response = $this->postJson('/api/v1/object', [
            'search' => '',
            'tree'   => true,
        ]);

        if ($response->status() === 401) {
            $this->markTestSkipped('tree endpoint requires authentication in this environment');
        }

        $response->assertStatus(200);
        $things = $response->json('things');

        $this->assertNotNull($things, 'tree should return root nodes');

        $ids = [];
        $types = [];
        $walk = function (array $nodes) use (&$walk, &$ids, &$types) {
            foreach ($nodes as $node) {
                $ids[] = $node['id'];
                $types[] = $node['type'] ?? null;
                if (!empty($node['nodes'])) {
                    $walk($node['nodes']);
                }
            }
        };
        $walk($things);

        // A system-owned model whose parent chain is fully part of the default
        // catalog must appear in the class tree as a MODEL (type 7) node.
        $this->assertContains('5a0f67ea-a290-4ef6-9ac5-0e85d967c4f9', $ids, 'Opel Zafira B model must appear in the class tree');
        $this->assertContains(7, $types, 'at least one MODEL (type 7) node must be present in the class tree');
    }
}
