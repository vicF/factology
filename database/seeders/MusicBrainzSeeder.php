<?php

namespace Database\Seeders;

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Seeded system objects for the MusicBrainz external object matching feature:
 *  - "Common public" property definition (class Property, inherited=true)
 *  - PROPERTY_APPLIES_TO link: Common public -> Everything
 *
 * "Common public" marks an object as intended to be compared against public
 * databases (MusicBrainz, OSM, etc.). When a canonical public record exists,
 * the local object is replaced by the canonical one.
 *
 * Value shape (stored in data.properties[<COMMON_PUBLIC>]):
 *   true
 *
 * Idempotent (upserts), like ListDividersSeeder.
 */
class MusicBrainzSeeder extends Seeder
{
    public function run(): void
    {
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        // "Common public" property definition (class Property, inherited=true).
        DB::table('things')->upsert(
            [
                'thing_id'          => UUID::COMMON_PUBLIC,
                'name'              => 'Common public',
                'description'       => 'Marks an object as intended to be compared against public databases (MusicBrainz, OSM, etc.). When a canonical public record exists, the local object is replaced by the canonical one.',
                'type'              => UUID::G_THING,
                'public'            => true,
                'server_uuid'       => $serverUuid,
                'name_translations' => json_encode(['lang' => 'en', 'ru' => 'Общее публичное']),
                'data'              => json_encode(['inherited' => true]),
            ],
            ['thing_id'],
            ['name', 'description', 'public', 'server_uuid', 'name_translations', 'data']
        );

        // Class membership: Common public is a Property.
        $this->upsertLink(
            UUID::COMMON_PUBLIC,
            UUID::LINK_TO_CLASS,
            UUID::PROPERTY_CLASS
        );

        // The property applies to Everything — any object may be common-public.
        $this->upsertLink(
            UUID::COMMON_PUBLIC,
            UUID::PROPERTY_APPLIES_TO,
            UUID::EVERYTHING
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