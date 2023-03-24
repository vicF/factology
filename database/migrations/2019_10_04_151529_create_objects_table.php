<?php

use App\Eloquent\Link;
use Fokin\Facts\Data\UUID;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Eloquent\Thing;

class CreateObjectsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     * @throws Throwable
     */
    public function up()
    {
        try {
            Schema::create('things', static function (Blueprint $table) {
                $table->uuid(Thing::ID)->primary()->comment('Object\'s UUID');
                $table->string('name')->nullable(false)->comment('Just some human readable name');
                $table->string('description')->comment('Just some human description of an object');
                $table->dateTime('start')->nullable(true)->comment('Time of start or creation of the object (birth, release etc)');
                $table->dateTime('end')->nullable(true)->comment('Time of end or destruction of the object (death, period end etc)');
            });

            Schema::create('links', static function (Blueprint $table) {
                $table->bigIncrements(Link::LINK_ID);
                $table->string('translation')->comment('Generated human readable translation');
                $table->uuid(Thing::ID)->comment('Object that has this link');
                $table->uuid('link_type_id')->comment('Type of this link');
                $table->uuid('other_thing_id')->comment('Linked object');
                $table->foreign('thing_id')->references('thing_id')->on('things')->onDelete('cascade');
                $table->foreign('other_thing_id')->references('thing_id')->on('things')->onDelete('cascade');
                $table->foreign('link_type_id')->references('thing_id')->on('things')->onDelete('cascade');
            });


            $things = DB::table('things');

            $things->insert(
                [
                    Thing::ID     => UUID::ANYTHING,
                    'name'        => 'Anything',
                    'description' => 'base object for everything',
                ]
            );

            $things->insert(
                [
                    Thing::ID     => UUID::LINK,
                    'name'        => 'Link',
                    'description' => 'base object for links'
                ]
            );

            $things->insert(
                [
                    Thing::ID     => UUID::PARENT,
                    'name'        => 'Parent',
                    'description' => 'Type of parent link whatever it can mean'
                ]
            );

            $things->insert(
                [
                    Thing::ID     => UUID::LINK_TO_CLASS,
                    'name'        => 'Class of',
                    'description' => 'Link to a class of an object'
                ]
            );

            $things->insert(
                [
                    Thing::ID     => UUID::SOMETHING,
                    'name'        => 'Something',
                    'description' => 'base class for all other classes'
                ]
            );

            // RELATIONS
            $links = DB::table('links');
            $links->insert(
                [
                    Thing::ID        => UUID::LINK,   // LINK class is child of Anything
                    'translation'    => '"Link" is subclass of "Anything"',
                    Link::TYPE       => UUID::PARENT,
                    'other_thing_id' => UUID::ANYTHING
                ]
            );

            $links->insert(
                [
                    Thing::ID        => UUID::PARENT,   // PARENT is subclass of LINK
                    'translation'    => '"Parent" is subclass of "Link"',
                    Link::TYPE       => UUID::PARENT,
                    'other_thing_id' => UUID::LINK
                ]
            );

            $links->insert(
                [
                    Thing::ID        => UUID::LINK_TO_CLASS,   // LINK_TO_CLASS is subclass of LINK
                    'translation'    => '"Class of" is subclass of "Link"',
                    Link::TYPE       => UUID::PARENT,
                    'other_thing_id' => UUID::LINK
                ]
            );

            $links->insert(
                [
                    Thing::ID        => UUID::SOMETHING,   // LINK_TO_CLASS is subclass of LINK
                    'translation'    => '"Something" is subclass of "Anything"',
                    Link::TYPE       => UUID::PARENT,
                    'other_thing_id' => UUID::ANYTHING
                ]
            );

        } catch (\Throwable $e) {
            $this->down();
            throw $e;
        }
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('links');
        Schema::dropIfExists('objects');
        Schema::dropIfExists('things');

    }
}