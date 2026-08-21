<?php

namespace Database\Seeders;

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Seeded system objects for the coordinates feature:
 *  - "Coordinates" property definition (class Property, inherited=true)
 *  - PROPERTY_APPLIES_TO link: Coordinates -> Place
 *
 * "Place" itself is a system class already seeded from
 * resources/js/localDb/system-objects.json (superclass of City, Country,
 * Planet, Building, house, ...). Linking "Coordinates" to it makes the field
 * suggested for every place-like class — on Earth or any other body — while any
 * object can still carry coordinates via "Add property" (detection is by value
 * shape, not by class).
 *
 * Idempotent (upserts), like LocalizationSeeder.
 */
class GeoCoordinatesSeeder extends Seeder
{
    public function run(): void
    {
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        // "Coordinates" property definition (class Property, inherited=true).
        DB::table('things')->upsert(
            [
                'thing_id'          => UUID::COORDINATES_PROPERTY,
                'name'              => 'Coordinates',
                'description'       => 'Location as a GeoJSON geometry (point, line, polygon, ...) on any celestial body (Earth by default).',
                'type'              => UUID::G_THING,
                'public'            => true,
                'server_uuid'       => $serverUuid,
                'name_translations' => json_encode(['lang' => 'en', 'ru' => 'Координаты']),
                'data'              => json_encode(['inherited' => true]),
            ],
            ['thing_id'],
            ['name', 'description', 'public', 'server_uuid', 'name_translations', 'data']
        );

        // Class membership: Coordinates is a Property.
        $this->upsertLink(
            UUID::COORDINATES_PROPERTY,
            UUID::LINK_TO_CLASS,
            UUID::PROPERTY_CLASS
        );

        // The property applies to Place — and, being inherited, to all its
        // subclasses (cities, buildings, mountains, craters ... on any body).
        $this->upsertLink(
            UUID::COORDINATES_PROPERTY,
            UUID::PROPERTY_APPLIES_TO,
            UUID::PLACE_CLASS
        );
    }

    /** Idempotent link upsert: matches on (one_thing_id, link_type_id, other_thing_id). */
    private function upsertLink(string $one, string $type, string $other): void
    {
        $link = DB::table('links')
            ->where('one_thing_id', $one)
            ->where('link_type_id', $type)
            ->where('other_thing_id', $other)
            ->first();

        if ($link) {
            DB::table('links')
                ->where('link_id', $link->link_id)
                ->update(['public' => true]);
        } else {
            DB::table('links')->insert([
                'one_thing_id'   => $one,
                'link_type_id'   => $type,
                'other_thing_id' => $other,
                'public'         => true,
                'link_uuid'      => (string) Str::uuid(),
            ]);
        }
    }
}
