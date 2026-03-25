<?php


use App\Eloquent\Link;
use App\Eloquent\Thing;
use Fokin\Facts\Data\UUID;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;


return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $things = DB::table('things');

        $things->insert(
            [
                Thing::ID     => UUID::SYSTEM,
                'name'        => 'System',
                'description' => 'Class Container for system objects',
                'type' => UUID::G_CLASS,
            ]
        );

        $things->insert(
            [
                Thing::ID     => UUID::USER,
                'name'        => 'User',
                'description' => 'System user object',
                'type' => UUID::G_CLASS,
            ]
        );



        // RELATIONS
        $links = DB::table('links');
        $links->insert(
            [
                'one_thing_id'        => UUID::SYSTEM,   // LINK class is child of Anything
                'translation'    => '"System" is subclass of "Anything"',
                Link::TYPE       => UUID::LINK_TO_PARENT,
                'other_thing_id' => UUID::ANYTHING
            ]
        );

        $links->insert(
            [
                'one_thing_id'         => UUID::USER,   // PARENT is subclass of LINK
                'translation'    => '"UserClass" is subclass of "System"',
                Link::TYPE       => UUID::LINK_TO_PARENT,
                'other_thing_id' => UUID::SYSTEM
            ]
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach([] as $uuid) {
            DB::table('things')->where('thing_id', $uuid)->delete();
            DB::table('links')
                ->where('one_thing_id', $uuid)
                ->orWhere('other_thing_id', $uuid)
                ->delete();
        }
    }
};
