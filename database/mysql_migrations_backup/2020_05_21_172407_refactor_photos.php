<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RefactorPhotos extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('photo_files', static function (Blueprint $table) {
            $table->uuid('file_thing_id')
                ->nullable()
                ->comment('Link to file object');
        });
        DB::raw('ALTER TABLE `factology`.`links` ADD UNIQUE `links_unique` (`thing_id`, `link_type_id`, `other_thing_id`)');
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('photo_files', static function (Blueprint $table) {
            $table->dropColumn('file_thing_id');
        });
        DB::raw('ALTER TABLE `factology`.`links` DROP INDEX `links_unique` ');
    }
}