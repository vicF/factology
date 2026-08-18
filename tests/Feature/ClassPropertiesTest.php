<?php

namespace Tests\Feature;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

/**
 * GET /api/v1/class/{id}/properties — suggested properties for a class,
 * resolved via PROPERTY_APPLIES_TO links ("is a property of class").
 */
class ClassPropertiesTest extends TestCase
{
    use CreatesTestUsers;
    use SafeRefreshDatabase;

    private function createClass(string $name = 'Place'): string
    {
        $classId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $classId,
            'name'        => $name,
            'type'        => UUID::G_CLASS,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
        return $classId;
    }

    private function createProperty(string $name, string $classId, array $data = null): string
    {
        $propId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $propId,
            'name'        => $name,
            'name_translations' => json_encode(['lang' => 'en']),
            'type'        => UUID::G_THING,
            'public'      => 1,
            'deleted'     => 0,
            'data'        => $data === null ? null : json_encode($data),
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
        DB::table('links')->insert([
            'one_thing_id'   => $propId,
            'other_thing_id' => $classId,
            'link_type_id'   => UUID::PROPERTY_APPLIES_TO,
            'public'         => 1,
            'deleted'        => 0,
            'link_uuid'      => (string) Str::uuid(),
        ]);
        return $propId;
    }

    /** Create a class that is a child (LINK_TO_PARENT) of $parentClassId. */
    private function createChildClass(string $parentClassId, string $name = 'City'): string
    {
        $classId = $this->createClass($name);
        DB::table('links')->insert([
            'one_thing_id'   => $classId,
            'other_thing_id' => $parentClassId,
            'link_type_id'   => UUID::LINK_TO_PARENT,
            'public'         => 1,
            'deleted'        => 0,
            'link_uuid'      => (string) Str::uuid(),
        ]);
        return $classId;
    }

    private function getProperties(string $classId): array
    {
        $res = $this->getJson('/api/v1/class/' . $classId . '/properties');
        $res->assertStatus(200);
        return $res->json('data');
    }

    /** @test */
    public function returns_properties_linked_to_the_class()
    {
        $classId = $this->createClass();
        $geo = $this->createProperty('Geo Coordinates', $classId);
        $weight = $this->createProperty('Weight', $classId);

        $properties = $this->getProperties($classId);

        $this->assertCount(2, $properties);
        $ids = array_column($properties, 'thing_id');
        sort($ids);
        $expected = [$geo, $weight];
        sort($expected);
        $this->assertEquals($expected, $ids);

        $geoRow = collect($properties)->firstWhere('thing_id', $geo);
        $this->assertEquals('Geo Coordinates', $geoRow['name']);
        $this->assertEquals(['lang' => 'en'], $geoRow['name_translations']);
    }

    /** @test */
    public function returns_empty_array_for_a_class_without_properties()
    {
        $classId = $this->createClass();

        $this->assertSame([], $this->getProperties($classId));
    }

    /** @test */
    public function ignores_properties_linked_with_other_link_types()
    {
        $classId = $this->createClass();
        $other = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $other,
            'name'        => 'Random Link',
            'type'        => UUID::G_THING,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
        DB::table('links')->insert([
            'one_thing_id'   => $other,
            'other_thing_id' => $classId,
            'link_type_id'   => UUID::LINK_TO_CLASS,
            'public'         => 1,
            'deleted'        => 0,
            'link_uuid'      => (string) Str::uuid(),
        ]);

        $this->assertSame([], $this->getProperties($classId));
    }

    /** @test */
    public function inherits_properties_from_ancestor_classes_by_default()
    {
        $parent = $this->createClass('Place');
        $child = $this->createChildClass($parent, 'City');
        $geo = $this->createProperty('Earth Coordinates', $parent);

        $childProperties = $this->getProperties($child);

        $this->assertCount(1, $childProperties);
        $this->assertEquals($geo, $childProperties[0]['thing_id']);
        $this->assertTrue($childProperties[0]['inherited']);
    }

    /** @test */
    public function inherited_false_blocks_propagation_to_subclasses()
    {
        $parent = $this->createClass('Place');
        $child = $this->createChildClass($parent, 'City');
        $geo = $this->createProperty('Earth Coordinates', $parent, ['inherited' => false]);

        // Not inherited → absent for the subclass…
        $childProperties = $this->getProperties($child);
        $this->assertSame([], $childProperties);

        // …but still present on the directly-linked class.
        $parentProperties = $this->getProperties($parent);
        $this->assertCount(1, $parentProperties);
        $this->assertEquals($geo, $parentProperties[0]['thing_id']);
        $this->assertFalse($parentProperties[0]['inherited']);
    }

    /** @test */
    public function direct_properties_apply_even_when_inherited_is_false()
    {
        $classId = $this->createClass('Museum');
        $prop = $this->createProperty('Entrance Fee', $classId, ['inherited' => false]);

        $properties = $this->getProperties($classId);

        $this->assertCount(1, $properties);
        $this->assertEquals($prop, $properties[0]['thing_id']);
        $this->assertFalse($properties[0]['inherited']);
    }

    /** @test */
    public function dedupes_when_a_property_is_linked_to_multiple_ancestors()
    {
        $grandparent = $this->createClass('Thing');
        $parent = $this->createChildClass($grandparent, 'Place');
        $child = $this->createChildClass($parent, 'City');
        $prop = $this->createProperty('Earth Coordinates', $grandparent);
        $this->createProperty('Earth Coordinates', $parent); // same name, different id → still two

        $properties = $this->getProperties($child);

        // Both ancestors' properties are inherited (different ids, both kept).
        $this->assertCount(2, $properties);
        $this->assertContains($prop, array_column($properties, 'thing_id'));
    }
}
