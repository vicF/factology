<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateTableAddExternalLinks extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('external_links', function (Blueprint $table) {
            $table->uuid('id');
            $table->uuid('thing_id');
            $table->foreign('thing_id')->references('thing_id')->on('things');
            $table->timestamps();
            $table->string('url');
            $table->uuid('url_type_id');
            $table->foreign('url_type_id')->references('thing_id')->on('things');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('external_links');
    }
}
