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
            ]);
        }

        // Bootstrap things (class hierarchy root nodes)
        if (DB::table('things')->count() === 0) {
            DB::table('things')->insert([
                [
                    'thing_id'    => UUID::ANYTHING,
                    'name'        => 'Anything',
                    'description' => 'base object for everything',
                    'type'        => UUID::GENERAL,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::LINK,
                    'name'        => 'Link',
                    'description' => 'base object for links',
                    'type'        => UUID::GENERAL,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::LINK_TO_PARENT,
                    'name'        => 'is a parent of',
                    'description' => 'Type of parent link whatever it can mean',
                    'type'        => UUID::GENERAL,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::LINK_TO_CLASS,
                    'name'        => 'is of class',
                    'description' => 'Link to a class of an object',
                    'type'        => UUID::GENERAL,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::SOMETHING,
                    'name'        => 'Something',
                    'description' => 'base class for all other classes',
                    'type'        => UUID::GENERAL,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::USER,
                    'name'        => 'User',
                    'description' => 'base class for user objects',
                    'type'        => UUID::GENERAL,
                    'public'      => false,
                ],
                [
                    'thing_id'    => UUID::SYSTEM,
                    'name'        => 'System',
                    'description' => 'system class',
                    'type'        => UUID::GENERAL,
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
        if (DB::table('links')->count() === 0) {
            DB::table('links')->insert([
                [
                    'translation'    => '"Link" is subclass of "Anything"',
                    'one_thing_id'   => UUID::LINK,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => UUID::ANYTHING,
                ],
                [
                    'translation'    => '"Parent" is subclass of "Link"',
                    'one_thing_id'   => UUID::LINK_TO_PARENT,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => UUID::LINK,
                ],
                [
                    'translation'    => '"Class of" is subclass of "Link"',
                    'one_thing_id'   => UUID::LINK_TO_CLASS,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => UUID::LINK,
                ],
                [
                    'translation'    => '"Something" is subclass of "Anything"',
                    'one_thing_id'   => UUID::SOMETHING,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => UUID::ANYTHING,
                ],
            ]);
        }

        // ============================================================
        // Environment-specific seeders
        // ============================================================
        if (app()->environment('testing')) {
            $this->call(TestDatabaseSeeder::class);
        }
    }
}
