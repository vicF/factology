<?php

namespace Database\Seeders;

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Seeded system objects for the Earth Coordinates feature:
 *  - "Place on Earth" class — top-level container for objects with a location
 *  - "Earth Coordinates" property definition (class Property, inherited=true)
 *  - PROPERTY_APPLIES_TO link: Earth Coordinates -> Place on Earth
 *  - LINK_TO_PARENT link: Place on Earth -> Everything
 *
 * Idempotent (upserts), like LocalizationSeeder.
 */
class GeoCoordinatesSeeder extends Seeder
{
    public function run(): void
    {
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        // "Place on Earth" class.
        DB::table('things')->upsert(
            [
                'thing_id'          => UUID::PLACE_ON_EARTH_CLASS,
                'name'              => 'Place on Earth',
                'description'       => 'Top-level class for objects that have a location on Earth.',
                'type'              => UUID::G_CLASS,
                'public'            => true,
                'server_uuid'       => $serverUuid,
                'name_translations' => json_encode(['lang' => 'en', 'ru' => 'Место на Земле']),
            ],
            ['thing_id'],
            ['name', 'description', 'public', 'server_uuid', 'name_translations']
        );

        // "Earth Coordinates" property definition (class Property, inherited=true).
        DB::table('things')->upsert(
            [
                'thing_id'          => UUID::EARTH_COORDINATES_PROPERTY,
                'name'              => 'Earth Coordinates',
                'description'       => 'Geographic location as a GeoJSON geometry (point, line, polygon, ...).',
                'type'              => UUID::G_THING,
                'public'            => true,
                'server_uuid'       => $serverUuid,
                'name_translations' => json_encode(['lang' => 'en', 'ru' => 'Координаты на Земле']),
                'data'              => json_encode(['inherited' => true]),
            ],
            ['thing_id'],
            ['name', 'description', 'public', 'server_uuid', 'name_translations', 'data']
        );

        // Class membership: Earth Coordinates is a Property.
        $this->upsertLink(
            UUID::EARTH_COORDINATES_PROPERTY,
            UUID::LINK_TO_CLASS,
            UUID::PROPERTY_CLASS,
            '"Earth Coordinates" is of class Property'
        );

        // Hierarchy: Place on Earth is a subclass of Everything.
        $this->upsertLink(
            UUID::PLACE_ON_EARTH_CLASS,
            UUID::LINK_TO_PARENT,
            UUID::EVERYTHING,
            '"Place on Earth" is subclass of "Everything"'
        );

        // The property applies to the class — and, being inherited, to its subclasses.
        $this->upsertLink(
            UUID::EARTH_COORDINATES_PROPERTY,
            UUID::PROPERTY_APPLIES_TO,
            UUID::PLACE_ON_EARTH_CLASS,
            'Earth Coordinates is a property of class Place on Earth'
        );
    }

    /** Idempotent link upsert: matches on (one_thing_id, link_type_id, other_thing_id). */
    private function upsertLink(string $one, string $type, string $other, string $translation): void
    {
        $link = DB::table('links')
            ->where('one_thing_id', $one)
            ->where('link_type_id', $type)
            ->where('other_thing_id', $other)
            ->first();

        if ($link) {
            DB::table('links')
                ->where('link_id', $link->link_id)
                ->update(['translation' => $translation, 'public' => true]);
        } else {
            DB::table('links')->insert([
                'one_thing_id'   => $one,
                'link_type_id'   => $type,
                'other_thing_id' => $other,
                'translation'    => $translation,
                'public'         => true,
                'link_uuid'      => (string) Str::uuid(),
            ]);
        }
    }
}
