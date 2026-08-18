<?php

namespace Tests\Feature;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\Traits\SafeRefreshDatabase;

/**
 * GeoCoordinatesSeeder: "Place on Earth" class + "Earth Coordinates" property,
 * wired so the property is suggested (inherited) for place-like classes.
 */
class GeoCoordinatesSeederTest extends TestCase
{
    use SafeRefreshDatabase;

    /** @test */
    public function seeds_geo_system_objects()
    {
        $this->assertDatabaseHas('things', ['thing_id' => UUID::PLACE_ON_EARTH_CLASS, 'type' => UUID::G_CLASS]);
        $this->assertDatabaseHas('things', ['thing_id' => UUID::EARTH_COORDINATES_PROPERTY, 'type' => UUID::G_THING]);

        $this->assertDatabaseHas('links', [
            'one_thing_id'   => UUID::EARTH_COORDINATES_PROPERTY,
            'link_type_id'   => UUID::PROPERTY_APPLIES_TO,
            'other_thing_id' => UUID::PLACE_ON_EARTH_CLASS,
        ]);
        $this->assertDatabaseHas('links', [
            'one_thing_id'   => UUID::PLACE_ON_EARTH_CLASS,
            'link_type_id'   => UUID::LINK_TO_PARENT,
            'other_thing_id' => UUID::EVERYTHING,
        ]);
        $this->assertDatabaseHas('links', [
            'one_thing_id'   => UUID::EARTH_COORDINATES_PROPERTY,
            'link_type_id'   => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::PROPERTY_CLASS,
        ]);

        $data = DB::table('things')->where('thing_id', UUID::EARTH_COORDINATES_PROPERTY)->value('data');
        $this->assertIsString($data);
        $this->assertTrue((bool) (json_decode($data, true)['inherited'] ?? false));
    }

    /** @test */
    public function a_subclass_of_place_on_earth_gets_the_inherited_property()
    {
        // A class whose parent is "Place on Earth" must inherit Earth Coordinates.
        $childClass = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $childClass,
            'name'        => 'Dacha',
            'type'        => UUID::G_CLASS,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
        DB::table('links')->insert([
            'one_thing_id'   => $childClass,
            'other_thing_id' => UUID::PLACE_ON_EARTH_CLASS,
            'link_type_id'   => UUID::LINK_TO_PARENT,
            'public'         => 1,
            'deleted'        => 0,
            'link_uuid'      => (string) Str::uuid(),
        ]);

        $res = $this->getJson('/api/v1/class/' . $childClass . '/properties');
        $res->assertStatus(200);

        $properties = $res->json('data');
        $this->assertCount(1, $properties);
        $this->assertEquals(UUID::EARTH_COORDINATES_PROPERTY, $properties[0]['thing_id']);
        $this->assertTrue($properties[0]['inherited']);
    }
}
