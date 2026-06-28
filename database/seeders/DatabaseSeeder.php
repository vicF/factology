<?php

namespace Database\Seeders;

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // ============================================================
        // Bootstrap data: system objects required by the application.
        // These are not user data — they are infrastructure records
        // referenced by the code (e.g. UUID::ANYTHING, UUID::USER).
        // ============================================================

        // General types
        if (DB::table('general_types')->count() === 0) {
            DB::table('general_types')->insert([
                ['id' => UUID::GENERAL,   'name' => 'GENERAL'],
                ['id' => UUID::G_CLASS,   'name' => 'CLASS'],
                ['id' => UUID::G_THING,   'name' => 'THING'],
                ['id' => UUID::G_LINK,    'name' => 'LINK'],
                ['id' => UUID::G_EXTERNAL,'name' => 'EXTERNAL'],
                ['id' => UUID::G_SERVER,  'name' => 'SERVER'],
            ]);
        }

        // Bootstrap things (class hierarchy root nodes)
        if (DB::table('things')->count() === 0) {
            DB::table('things')->insert([
                [
                    'thing_id'    => UUID::ANYTHING,
                    'name'        => 'Anything',
                    'description' => 'base object for everything',
                    'type'        => UUID::G_CLASS,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::LINK,
                    'name'        => 'Link',
                    'description' => 'base object for links',
                    'type'        => UUID::G_LINK,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::LINK_TO_PARENT,
                    'name'        => 'is a parent of',
                    'description' => 'Type of parent link whatever it can mean',
                    'type'        => UUID::G_LINK,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::LINK_TO_CLASS,
                    'name'        => 'is of class',
                    'description' => 'Link to a class of an object',
                    'type'        => UUID::G_LINK,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::SOMETHING,
                    'name'        => 'Something',
                    'description' => 'base class for all other classes',
                    'type'        => UUID::G_CLASS,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::USER,
                    'name'        => 'User',
                    'description' => 'base class for user objects',
                    'type'        => UUID::G_CLASS,
                    'public'      => false,
                ],
                [
                    'thing_id'    => UUID::SYSTEM,
                    'name'        => 'System',
                    'description' => 'system class',
                    'type'        => UUID::G_CLASS,
                    'public'      => false,
                ],
                [
                    'thing_id'    => UUID::VICTOR_FOKIN,
                    'name'        => 'System',
                    'description' => 'default owner / system account',
                    'type'        => UUID::GENERAL,
                    'public'      => false,
                ],
            ]);
        }

        // Bootstrap links (class hierarchy edges)
        // Direction: one_thing_id is the PARENT, other_thing_id is the CHILD
        if (DB::table('links')->count() === 0) {
            DB::table('links')->insert([
                [
                    'translation'    => '"Link" is subclass of "Anything"',
                    'one_thing_id'   => UUID::ANYTHING,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => UUID::LINK,
                ],
                [
                    'translation'    => '"Parent" is subclass of "Link"',
                    'one_thing_id'   => UUID::LINK,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => UUID::LINK_TO_PARENT,
                ],
                [
                    'translation'    => '"Class of" is subclass of "Link"',
                    'one_thing_id'   => UUID::LINK,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => UUID::LINK_TO_CLASS,
                ],
                [
                    'translation'    => '"Something" is subclass of "Anything"',
                    'one_thing_id'   => UUID::ANYTHING,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => UUID::SOMETHING,
                ],
            ]);
        }

        // ============================================================
        // Base class tree (top-level categories under "Something")
        // Added individually — safe to re-run.
        // ============================================================
        $baseClasses = [
            [
                'thing_id'    => UUID::EVENTS,
                'name'        => 'Events',
                'description' => 'Events of any kind: personal, work, historical',
                'type'        => UUID::G_CLASS,
                'public'      => true,
            ],
            [
                'thing_id'    => UUID::PEOPLE,
                'name'        => 'People',
                'description' => 'People: family, friends, colleagues, public figures',
                'type'        => UUID::G_CLASS,
                'public'      => true,
            ],
            [
                'thing_id'    => UUID::PLACES,
                'name'        => 'Places',
                'description' => 'Places: cities, buildings, natural locations',
                'type'        => UUID::G_CLASS,
                'public'      => true,
            ],
            [
                'thing_id'    => UUID::MEDIA,
                'name'        => 'Media',
                'description' => 'Media files: photos, videos, documents, audio',
                'type'        => UUID::G_CLASS,
                'public'      => true,
            ],
            [
                'thing_id'    => UUID::ORGANIZATIONS,
                'name'        => 'Organizations',
                'description' => 'Organizations: companies, schools, governments',
                'type'        => UUID::G_CLASS,
                'public'      => true,
            ],
            [
                'thing_id'    => UUID::SYSTEM_CLASS,
                'name'        => 'System (internal)',
                'description' => 'Internal system classes (hidden from normal browsing)',
                'type'        => UUID::G_CLASS,
                'public'      => false,
            ],
        ];

        foreach ($baseClasses as $class) {
            DB::table('things')->upsert($class, ['thing_id'], ['name', 'description', 'public']);
        }

        // Link base classes under "Something"
        $baseClassLinks = [
            [UUID::SOMETHING, UUID::EVENTS],
            [UUID::SOMETHING, UUID::PEOPLE],
            [UUID::SOMETHING, UUID::PLACES],
            [UUID::SOMETHING, UUID::MEDIA],
            [UUID::SOMETHING, UUID::ORGANIZATIONS],
            [UUID::SOMETHING, UUID::SYSTEM_CLASS],
        ];

        foreach ($baseClassLinks as [$parent, $child]) {
            $exists = DB::table('links')
                ->where('one_thing_id', $parent)
                ->where('link_type_id', UUID::LINK_TO_PARENT)
                ->where('other_thing_id', $child)
                ->exists();

            if (!$exists) {
                DB::table('links')->insert([
                    'one_thing_id'   => $parent,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => $child,
                    'translation'    => "\"{$child}\" is subclass of \"{$parent}\"",
                ]);
            }
        }

        // ============================================================
        // Provenance & identity link types (under "Link" root)
        // ============================================================
        $provenanceLinkTypes = [
            [
                'thing_id'    => UUID::CREATED_BY,
                'name'        => 'created by',
                'description' => 'Links an object to the User UUID that created it',
                'type'        => UUID::G_LINK,
                'public'      => true,
                'owner'       => UUID::SYSTEM,
            ],
            [
                'thing_id'    => UUID::CREATED_ON,
                'name'        => 'created on',
                'description' => 'Links an object to the Server or App UUID where it was created',
                'type'        => UUID::G_LINK,
                'public'      => true,
                'owner'       => UUID::SYSTEM,
            ],
            [
                'thing_id'    => UUID::SAME_AS,
                'name'        => 'same as',
                'description' => 'Links two objects that represent the same real-world entity',
                'type'        => UUID::G_LINK,
                'public'      => true,
                'owner'       => UUID::SYSTEM,
            ],
            [
                'thing_id'    => UUID::DERIVED_FROM,
                'name'        => 'derived from',
                'description' => 'Links a copied object to its source object',
                'type'        => UUID::G_LINK,
                'public'      => true,
                'owner'       => UUID::SYSTEM,
            ],
            [
                'thing_id'    => UUID::SUPERSEDED_BY,
                'name'        => 'superseded by',
                'description' => 'Links a deprecated object to its replacement',
                'type'        => UUID::G_LINK,
                'public'      => true,
                'owner'       => UUID::SYSTEM,
            ],
            [
                'thing_id'    => UUID::SUGGESTS_CHANGE,
                'name'        => 'suggests change to',
                'description' => 'Links a suggestion object to the target object it proposes changes to',
                'type'        => UUID::G_LINK,
                'public'      => true,
                'owner'       => UUID::SYSTEM,
            ],
        ];

        foreach ($provenanceLinkTypes as $linkType) {
            DB::table('things')->upsert($linkType, ['thing_id'], ['name', 'description', 'public', 'owner']);
        }

        // Link provenance types under "Link"
        $provenanceLinkIds = [
            UUID::CREATED_BY, UUID::CREATED_ON, UUID::SAME_AS,
            UUID::DERIVED_FROM, UUID::SUPERSEDED_BY, UUID::SUGGESTS_CHANGE,
        ];

        foreach ($provenanceLinkIds as $linkId) {
            $exists = DB::table('links')
                ->where('one_thing_id', UUID::LINK)
                ->where('link_type_id', UUID::LINK_TO_PARENT)
                ->where('other_thing_id', $linkId)
                ->exists();

            if (!$exists) {
                DB::table('links')->insert([
                    'one_thing_id'   => UUID::LINK,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => $linkId,
                    'translation'    => "\"{$linkId}\" is subclass of \"Link\"",
                ]);
            }
        }

        // ============================================================
        // Environment-specific seeders
        // ============================================================
        if (app()->environment('testing')) {
            $this->call(TestDatabaseSeeder::class);
        }
    }
}
