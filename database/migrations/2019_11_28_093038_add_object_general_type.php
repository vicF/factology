<?php

use App\Eloquent\Thing;
use App\Models\Classes\Anything;
use Fokin\Facts\Data\UUID;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;


class AddObjectGeneralType extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up(): void
    {
        Schema::table('things', static function (Blueprint $table) {
            $table->enum('type', [Anything::GENERAL, Anything::LINK, Anything::CLS, Anything::THING])
                ->after('name')
                ->comment('Defines few global types of objects like thing, link, class')
                ->default(Anything::GENERAL)
                ->nullable(false);
        });


        DB::table('things')
            ->where(Thing::ID, UUID::PARENT)
            ->update(
                [
                    'type' => Anything::LINK,
                ]
            );


        DB::table('things')
            ->where(Thing::ID, UUID::SOMETHING)
            ->update(
                [
                    'type' => Anything::CLS,

                ]
            );


        DB::table('things')
        ->where(Thing::ID, UUID::LINK_TO_CLASS)
        ->update(
            [
                'type' => Anything::LINK,
            ]
        );

        DB::table('things')
            ->where(Thing::ID, UUID::LINK)
            ->update(
                [
                    'type' => Anything::LINK,
                ]
            );
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down(): void
    {
        Schema::table('things', static function (Blueprint $table) {
            $table->dropColumn('type');
        });
    }
}
