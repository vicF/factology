<?php

namespace Tests\Feature;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

/**
 * GET /api/v1/properties — all property definitions (things of class Property),
 * used by the edit form's "Add property" picker.
 */
class PropertiesListTest extends TestCase
{
    use CreatesTestUsers;
    use SafeRefreshDatabase;

    private function createPropertyThing(string $name): string
    {
        $propId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $propId,
            'name'        => $name,
            'type'        => UUID::G_THING,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
        DB::table('links')->insert([
            'one_thing_id'   => $propId,
            'other_thing_id' => UUID::PROPERTY_CLASS,
            'link_type_id'   => UUID::LINK_TO_CLASS,
            'public'         => 1,
            'deleted'        => 0,
            'link_uuid'      => (string) Str::uuid(),
        ]);
        return $propId;
    }

    private function getProperties(): array
    {
        $res = $this->getJson('/api/v1/properties');
        $res->assertStatus(200);
        return $res->json('data');
    }

    /** @test */
    public function returns_all_property_definitions()
    {
        $geo = $this->createPropertyThing('Earth Coordinates');
        $weight = $this->createPropertyThing('Weight');

        $properties = $this->getProperties();

        // Includes the seeded "Coordinates" property too.
        $ids = array_column($properties, 'thing_id');
        $this->assertContains($geo, $ids);
        $this->assertContains($weight, $ids);

        $geoRow = collect($properties)->firstWhere('thing_id', $geo);
        $this->assertEquals('Earth Coordinates', $geoRow['name']);
        $this->assertArrayHasKey('name_translations', $geoRow);
    }

    /** @test */
    public function excludes_objects_of_other_classes()
    {
        $geo = $this->createPropertyThing('Earth Coordinates');

        // A plain object (not of class Property) must not appear.
        $plain = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $plain,
            'name'        => 'Plain Object',
            'type'        => UUID::G_THING,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);

        $properties = $this->getProperties();

        $ids = array_column($properties, 'thing_id');
        $this->assertNotContains($plain, $ids);
        $this->assertContains($geo, $ids);
        // Everything returned is a member of the Property class.
        foreach ($ids as $id) {
            $this->assertDatabaseHas('links', [
                'one_thing_id'   => $id,
                'link_type_id'   => UUID::LINK_TO_CLASS,
                'other_thing_id' => UUID::PROPERTY_CLASS,
            ]);
        }
    }

    /** @test */
    public function never_returns_non_property_things()
    {
        // A class thing (type G_CLASS) must never appear in the properties list.
        $plainClass = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $plainClass,
            'name'        => 'Not A Property',
            'type'        => UUID::G_CLASS,
            'public'      => 1,
            'deleted'     => 0,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);

        $ids = array_column($this->getProperties(), 'thing_id');

        $this->assertNotEmpty($ids);
        $this->assertNotContains($plainClass, $ids);
    }
}
