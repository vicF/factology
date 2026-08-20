<?php

namespace Tests\Feature;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\Traits\SafeRefreshDatabase;

/**
 * GeoCoordinatesSeeder: "Coordinates" property definition linked to the system
 * "Place" class, so the field is suggested (inherited) for place-like classes
 * — on Earth or any other body.
 */
class GeoCoordinatesSeederTest extends TestCase
{
    use SafeRefreshDatabase;

    /** @test */
    public function seeds_geo_system_objects()
    {
        // "Place" is a system class seeded from system-objects.json.
        $this->assertDatabaseHas('things', ['thing_id' => UUID::PLACE_CLASS, 'type' => UUID::G_CLASS]);
        $this->assertDatabaseHas('things', ['thing_id' => UUID::COORDINATES_PROPERTY, 'type' => UUID::G_THING]);

        $this->assertDatabaseHas('links', [
            'one_thing_id'   => UUID::COORDINATES_PROPERTY,
            'link_type_id'   => UUID::PROPERTY_APPLIES_TO,
            'other_thing_id' => UUID::PLACE_CLASS,
        ]);
        $this->assertDatabaseHas('links', [
            'one_thing_id'   => UUID::COORDINATES_PROPERTY,
            'link_type_id'   => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::PROPERTY_CLASS,
        ]);

        $data = DB::table('things')->where('thing_id', UUID::COORDINATES_PROPERTY)->value('data');
        $this->assertIsString($data);
        $this->assertTrue((bool) (json_decode($data, true)['inherited'] ?? false));
    }

    /** @test */
    public function a_subclass_of_place_gets_the_inherited_property()
    {
        // A class whose parent is "Place" must inherit Coordinates.
        $childClass = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $childClass,
            'name'        => 'Mountain',
            'type'        => UUID::G_CLASS,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
        // Hierarchy convention: one_thing_id = parent/superclass, other = child.
        DB::table('links')->insert([
            'one_thing_id'   => UUID::PLACE_CLASS,
            'other_thing_id' => $childClass,
            'link_type_id'   => UUID::LINK_TO_PARENT,
            'public'         => 1,
            'deleted'        => 0,
            'link_uuid'      => (string) Str::uuid(),
        ]);

        $res = $this->getJson('/api/v1/class/' . $childClass . '/properties');
        $res->assertStatus(200);

        $properties = $res->json('data');
        $this->assertCount(1, $properties);
        $this->assertEquals(UUID::COORDINATES_PROPERTY, $properties[0]['thing_id']);
        $this->assertTrue($properties[0]['inherited']);
    }
}
