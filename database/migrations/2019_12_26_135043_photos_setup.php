<?php

use App\Eloquent\Thing;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class PhotosSetup extends Migration
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
            Schema::create('photo_media', static function (Blueprint $table) {
                $table->uuid(Thing::ID)->primary()->comment('Media\'s UUID');
                $table->string('filename')->comment('Base file name with extension');
                $table->string('size')->comment('File size in bytes');
                $table->string('crc')->nullable()->comment('CRC sum to identify the file');

            });

            Schema::create('photo_files', static function (Blueprint $table) {
                $table->bigIncrements('id')->comment('File id');
                $table->uuid(Thing::ID)->comment('Media\'s UUID');
                $table->string('filename')->comment('Base file name with extension');
                $table->string('path')->nullable()->comment('Path to file');
                $table->string('size')->comment('File size in bytes');
                $table->string('crc')->nullable()->comment('CRC sum to identify the file');
                $table->foreign('thing_id')->references(Thing::ID)->on('photo_media')->onDelete('cascade');
            });

            Schema::create('photo_places', static function (Blueprint $table) {
                $table->bigIncrements('place_id')->comment('Primary id');
                $table->uuid('service_uuid')->comment('UUID of computer, volume or service account where files are stored');
                $table->string('description')->comment('Description of storage');
                $table->string('base_path')->comment('Path from volume root to folder with indexed files');
            });
        } catch(\Throwable $e) {
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
        Schema::dropIfExists('photo_files');
        Schema::dropIfExists('photo_places');
        Schema::dropIfExists('photo_media');
    }
}
