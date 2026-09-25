<?php

namespace Database\Seeders;

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Seeded system objects for the list dividers feature:
 *  - "Dividers" property definition (class Property, inherited=true)
 *  - PROPERTY_APPLIES_TO link: Dividers -> List
 *
 * "List" is a system class (superclass of Setlist, Practice list, Repertoire).
 * Linking "Dividers" to it makes the field suggested for every list-like class,
 * while any object can still carry dividers via "Add property".
 *
 * Value shape (stored in data.properties[<DIVIDER_PROPERTY>]):
 *   [{ "break": "1st Break", "position_after": 10 }, ...]
 *
 * Idempotent (upserts), like LocalizationSeeder.
 */
class ListDividersSeeder extends Seeder
{
    public function run(): void
    {
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        // "Dividers" property definition (class Property, inherited=true).
        DB::table('things')->upsert(
            [
                'thing_id'          => UUID::DIVIDER_PROPERTY,
                'name'              => 'Dividers',
                'description'       => 'List dividers or time breaks that live with the list object (not as separate entries). Dividers mark positions within an ordered list — for example, setbreak markers in a performance setlist.',
                'type'              => UUID::G_THING,
                'public'            => true,
                'server_uuid'       => $serverUuid,
                'name_translations' => json_encode(['lang' => 'en', 'ru' => 'Разделители']),
                'data'              => json_encode(['inherited' => true]),
            ],
            ['thing_id'],
            ['name', 'description', 'public', 'server_uuid', 'name_translations', 'data']
        );

        // Class membership: Dividers is a Property.
        $this->upsertLink(
            UUID::DIVIDER_PROPERTY,
            UUID::LINK_TO_CLASS,
            UUID::PROPERTY_CLASS
        );

        // The property applies to List — and, being inherited, to all its
        // subclasses (Setlist, Practice list, Repertoire, Task list, ...).
        $this->upsertLink(
            UUID::DIVIDER_PROPERTY,
            UUID::PROPERTY_APPLIES_TO,
            UUID::LIST_CLASS
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