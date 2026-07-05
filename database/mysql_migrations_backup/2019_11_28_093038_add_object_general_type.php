<?php

use App\Eloquent\Thing;
use App\Models\Classes\Everything;
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
        // Skip on PostgreSQL — handled by consolidated migration
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        Schema::table('things', static function (Blueprint $table) {
            $table->enum('type', [Everything::GENERAL, Everything::LINK, Everything::CLS, Everything::THING])
                ->after('name')
                ->comment('Defines few global types of objects like thing, link, class')
                ->default(Everything::GENERAL)
                ->nullable(false);
        });


        DB::table('things')
            ->where(Thing::ID, UUID::LINK_TO_PARENT)
            ->update(
                [
                    'type' => Everything::LINK,
                ]
            );


        DB::table('things')
            ->where(Thing::ID, UUID::SOMETHING)
            ->update(
                [
                    'type' => Everything::CLS,

                ]
            );


        DB::table('things')
        ->where(Thing::ID, UUID::LINK_TO_CLASS)
        ->update(
            [
                'type' => Everything::LINK,
            ]
        );

        DB::table('things')
            ->where(Thing::ID, UUID::LINK)
            ->update(
                [
                    'type' => Everything::LINK,
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
