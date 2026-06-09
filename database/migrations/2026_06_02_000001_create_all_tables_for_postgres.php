<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Auto-generated migration from MySQL dump.
 * Creates the complete database schema for PostgreSQL.
 */
class CreateAllTablesForPostgres extends Migration
{
    public function up(): void
    {
        // === general_types ===
        if (!Schema::hasTable('general_types')) {
            Schema::create('general_types', function (Blueprint $table) {
                $table->smallIncrements('id');
                $table->string('name', 255);
            });
        }

        // === things ===
        if (!Schema::hasTable('things')) {
            Schema::create('things', function (Blueprint $table) {
                $table->uuid('thing_id')->comment('Object\'s UUID');
                $table->string('name', 255)->comment('Just some human readable name');
                $table->unsignedSmallInteger('type');
                $table->text('description')->nullable()->comment('Just some human description of an object');
                $table->decimal('start', 28, 0)->nullable();
                $table->decimal('end', 28, 0)->nullable();
                $table->double('start_variety')->nullable()->comment('Approximate time variety for not certain dates');
                $table->double('end_variety')->nullable()->comment('Approximate time variety for not certain dates');
                $table->timestamp('record_created')->useCurrent()->comment('Record creation time');
                $table->timestamp('record_updated')->useCurrent()->useCurrentOnUpdate();
                $table->char('owner', 36)->default('0ac1b13b-acbf-4246-bed4-8f0c2a8b2546');
                $table->boolean('public')->default(false)->comment('If true it can be read by anybody');
                $table->boolean('deleted')->default(false)->comment('Mark for deletion');
                $table->json('data')->nullable();
                $table->primary('thing_id');
                $table->index('start', 'start_index');
                $table->foreign('type', 'things_type_foreign')->references('id')->on('general_types');
            });
        }

        // === photo_media ===
        if (!Schema::hasTable('photo_media')) {
            Schema::create('photo_media', function (Blueprint $table) {
                $table->uuid('thing_id')->comment('Media\'s UUID');
                $table->string('filename', 255)->comment('Base file name with extension');
                $table->string('size', 255)->comment('File size in bytes');
                $table->string('crc', 255)->nullable()->comment('CRC sum to identify the file');
                $table->decimal('exif_date', 28, 0)->nullable()->comment('Exif date or earliest known file creation date. Used to find similar files. ');
                $table->decimal('event_date', 28, 0)->comment('Copy of things.start field just for quick search');
                $table->decimal('latitude', 14, 12)->nullable();
                $table->decimal('longitude', 14, 11)->nullable();
                $table->boolean('media_deleted')->default(false)->comment('Copy of things.deleted. Some media that was added by mistake');
                $table->text('exif')->nullable()->comment('EXIF data from the image');
                $table->binary('phash')->nullable()->comment('perceptual hash of image jenssegers/imagehash');
                $table->char('sha256', 64)->nullable()->comment('sha256 hash of file');
                $table->primary('thing_id');
                $table->index(['size', 'crc'], 'photo_media_size_crc_index');
                $table->index('phash', 'photo_media_phash_index');
                $table->index(['size', 'sha256'], 'size_sha_index');
                $table->foreign('thing_id', 'photo_media_things_thing_id_foreign')->references('thing_id')->on('things')->onDelete('cascade');
            });
        }

        // === photo_files ===
        if (!Schema::hasTable('photo_files')) {
            Schema::create('photo_files', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->uuid('media_thing_id')->comment('Media\'s UUID');
                $table->string('filename', 255)->comment('Base file name with extension');
                $table->string('path', 255)->nullable()->comment('Path to file');
                $table->string('size', 255)->comment('File size in bytes');
                $table->string('crc', 255)->nullable()->comment('CRC sum to identify the file');
                $table->char('folder_id', 36)->comment('Links to folder containing this path');
                $table->unsignedInteger('last_seen')->nullable();
                $table->boolean('file_deleted')->default(false)->comment('This file was physically missing during the last scan');
                $table->char('file_thing_id', 36)->nullable()->comment('Link to file object');
                $table->unsignedInteger('ctime');
                $table->unique('file_thing_id', 'photo_files_file_thing_id_unique');
                $table->unique(['filename', 'path', 'folder_id'], 'photo_files_filename_path_folder_id_unique');
                $table->index(['size', 'crc'], 'photo_files_size_crc_index');
                $table->foreign('media_thing_id', 'photo_files_thing_id_foreign')->references('thing_id')->on('photo_media')->onDelete('cascade');
            });
        }

        // === photo_places ===
        if (!Schema::hasTable('photo_places')) {
            Schema::create('photo_places', function (Blueprint $table) {
                $table->bigIncrements('place_id');
                $table->uuid('service_uuid')->comment('UUID of computer, volume or service account where files are stored');
                $table->string('description', 255)->comment('Description of storage');
                $table->string('base_path', 255)->comment('Path from volume root to folder with indexed files');
            });
        }

        // === classes ===
        if (!Schema::hasTable('classes')) {
            Schema::create('classes', function (Blueprint $table) {
                $table->uuid('thing_id')->comment('Class UUID');
                $table->string('class_name', 255)->comment('PHP class name');
                $table->primary('thing_id');
            });
        }

        // === users ===
        if (!Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('name', 255);
                $table->string('email', 255);
                $table->timestamp('email_verified_at')->nullable();
                $table->string('password', 255);
                $table->text('two_factor_secret')->nullable();
                $table->text('two_factor_recovery_codes')->nullable();
                $table->timestamp('two_factor_confirmed_at')->nullable();
                $table->string('api_token', 80)->nullable();
                $table->string('remember_token', 100)->nullable();
                $table->timestamp('created_at')->nullable();
                $table->timestamp('updated_at')->nullable();
                $table->uuid('thing_id')->unique()->comment('Id of person object(DC2Type:guid)');
                $table->unique('email', 'users_email_unique');
                $table->unique('api_token', 'users_api_token_unique');
                $table->foreign('thing_id', 'users_thing_id_foreign')->references('thing_id')->on('things');
            });
        }

        // === external_links ===
        if (!Schema::hasTable('external_links')) {
            Schema::create('external_links', function (Blueprint $table) {
                $table->uuid('id')->comment('(DC2Type:uuid)');
                $table->uuid('thing_id');
                $table->timestamp('created_at')->nullable();
                $table->timestamp('updated_at')->nullable();
                $table->string('url', 255);
                $table->uuid('url_type_id');
                $table->primary('id');
                $table->foreign('thing_id', 'external_links_thing_id_foreign')->references('thing_id')->on('things');
                $table->foreign('url_type_id', 'external_links_url_type_id_foreign')->references('thing_id')->on('things');
            });
        }

        // === links ===
        if (!Schema::hasTable('links')) {
            Schema::create('links', function (Blueprint $table) {
                $table->bigIncrements('link_id');
                $table->string('translation', 255)->nullable()->comment('Generated human readable translation');
                $table->uuid('one_thing_id')->comment('Object that has this link');
                $table->uuid('link_type_id')->comment('Type of this link');
                $table->uuid('other_thing_id')->comment('Linked object');
                $table->boolean('public')->default(true)->comment('Links are public by default. But it works only if things are public');
                $table->decimal('link_start', 28, 0)->nullable()->comment('time when this relation started (if applicable)');
                $table->decimal('link_end', 28, 0)->nullable()->comment('time when this relation started (if applicable)');
                $table->decimal('link_start_variety', 10, 0)->nullable()->comment('Approximate time variety for not certain dates');
                $table->decimal('link_end_variety', 10, 0)->nullable()->comment('Approximate time variety for not certain dates');
                $table->unique(['one_thing_id', 'other_thing_id', 'link_type_id'], 'links_unique_combination');
                $table->index(['other_thing_id', 'link_type_id'], 'links_other_thing_id_link_type_id_index');
                $table->foreign('link_type_id', 'links_link_type_id_foreign')->references('thing_id')->on('things')->onDelete('cascade');
                $table->foreign('other_thing_id', 'links_other_thing_id_foreign')->references('thing_id')->on('things')->onDelete('cascade');
                $table->foreign('one_thing_id', 'links_thing_id_foreign')->references('thing_id')->on('things')->onDelete('cascade');
            });
        }

        // Handle pre-existing links table that still uses old column name
        if (Schema::hasTable('links') && Schema::hasColumn('links', 'thing_id') && !Schema::hasColumn('links', 'one_thing_id')) {
            DB::statement('ALTER TABLE links RENAME COLUMN thing_id TO one_thing_id');
        }

        // === links_access ===
        if (!Schema::hasTable('links_access')) {
            Schema::create('links_access', function (Blueprint $table) {
                $table->bigIncrements('link_id');
                $table->uuid('group_id');
                $table->boolean('read');
                $table->boolean('write');
                $table->foreign('group_id', 'links_access_group_id_foreign')->references('thing_id')->on('things')->onDelete('cascade');
                $table->foreign('link_id', 'links_access_link_id_foreign')->references('link_id')->on('links')->onDelete('cascade');
            });
        }

        // === favorites ===
        if (!Schema::hasTable('favorites')) {
            Schema::create('favorites', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->uuid('user_id');
                $table->uuid('favorite_id');
                $table->foreign('favorite_id', 'favorites_favorite_id_foreign')->references('thing_id')->on('things');
                $table->foreign('user_id', 'favorites_user_id_foreign')->references('thing_id')->on('users');
            });
        }

        // === history ===
        if (!Schema::hasTable('history')) {
            Schema::create('history', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->uuid('user_id');
                $table->uuid('history_id');
                $table->timestamp('viewed_at')->useCurrent()->useCurrentOnUpdate();
                $table->foreign('history_id', 'history_history_id_foreign')->references('thing_id')->on('things')->onDelete('cascade');
                $table->foreign('user_id', 'history_user_id_foreign')->references('thing_id')->on('users')->onDelete('cascade');
            });
        }

        // === things_access ===
        if (!Schema::hasTable('things_access')) {
            Schema::create('things_access', function (Blueprint $table) {
                $table->uuid('accessed_thing_id');
                $table->uuid('group_id');
                $table->boolean('read');
                $table->boolean('write');
                $table->primary('accessed_thing_id');
                $table->foreign('group_id', 'things_access_group_id_foreign')->references('thing_id')->on('things')->onDelete('cascade');
                $table->foreign('accessed_thing_id', 'things_access_thing_id_foreign')->references('thing_id')->on('things')->onDelete('cascade');
            });
        }

        // === migrations (skip if already created by Laravel's migration system) ===
        if (!Schema::hasTable('migrations')) {
            Schema::create('migrations', function (Blueprint $table) {
                $table->increments('id');
                $table->string('migration', 255);
                $table->integer('batch');
            });
        }

        // === failed_jobs ===
        if (!Schema::hasTable('failed_jobs')) {
            Schema::create('failed_jobs', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->text('connection');
                $table->text('queue');
                $table->longText('payload');
                $table->longText('exception');
                $table->timestamp('failed_at')->useCurrent();
            });
        }

        // === password_resets ===
        if (!Schema::hasTable('password_resets')) {
            Schema::create('password_resets', function (Blueprint $table) {
                $table->string('email', 255);
                $table->string('token', 255);
                $table->timestamp('created_at')->nullable();
                $table->index('email', 'password_resets_email_index');
            });
        }

        // === personal_access_tokens ===
        if (!Schema::hasTable('personal_access_tokens')) {
            Schema::create('personal_access_tokens', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('tokenable_type', 255);
                $table->unsignedBigInteger('tokenable_id');
                $table->string('name', 255);
                $table->string('token', 64);
                $table->text('abilities')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamp('created_at')->nullable();
                $table->timestamp('updated_at')->nullable();
                $table->unique('token', 'personal_access_tokens_token_unique');
                $table->index(['tokenable_type', 'tokenable_id'], 'personal_access_tokens_tokenable_type_tokenable_id_index');
            });
        }

        // === oauth_clients ===
        if (!Schema::hasTable('oauth_clients')) {
            Schema::create('oauth_clients', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('name', 255);
                $table->string('secret', 100)->nullable();
                $table->text('redirect');
                $table->boolean('personal_access_client');
                $table->boolean('password_client');
                $table->boolean('revoked');
                $table->timestamp('created_at')->nullable();
                $table->timestamp('updated_at')->nullable();
                $table->index('user_id', 'oauth_clients_user_id_index');
            });
        }

        // === oauth_personal_access_clients ===
        if (!Schema::hasTable('oauth_personal_access_clients')) {
            Schema::create('oauth_personal_access_clients', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('client_id');
                $table->timestamp('created_at')->nullable();
                $table->timestamp('updated_at')->nullable();
            });
        }

        // === oauth_access_tokens ===
        if (!Schema::hasTable('oauth_access_tokens')) {
            Schema::create('oauth_access_tokens', function (Blueprint $table) {
                $table->string('id', 100);
                $table->unsignedBigInteger('user_id')->nullable();
                $table->unsignedBigInteger('client_id');
                $table->string('name', 255)->nullable();
                $table->text('scopes')->nullable();
                $table->boolean('revoked');
                $table->timestamp('created_at')->nullable();
                $table->timestamp('updated_at')->nullable();
                $table->dateTime('expires_at')->nullable();
                $table->primary('id');
                $table->index('user_id', 'oauth_access_tokens_user_id_index');
            });
        }

        // === oauth_auth_codes ===
        if (!Schema::hasTable('oauth_auth_codes')) {
            Schema::create('oauth_auth_codes', function (Blueprint $table) {
                $table->string('id', 100);
                $table->unsignedBigInteger('user_id');
                $table->unsignedBigInteger('client_id');
                $table->text('scopes')->nullable();
                $table->boolean('revoked');
                $table->dateTime('expires_at')->nullable();
                $table->primary('id');
                $table->index('user_id', 'oauth_auth_codes_user_id_index');
            });
        }

        // === oauth_refresh_tokens ===
        if (!Schema::hasTable('oauth_refresh_tokens')) {
            Schema::create('oauth_refresh_tokens', function (Blueprint $table) {
                $table->string('id', 100);
                $table->string('access_token_id', 100);
                $table->boolean('revoked');
                $table->dateTime('expires_at')->nullable();
                $table->primary('id');
            });
        }

        // === telescope_entries ===
        if (!Schema::hasTable('telescope_entries')) {
            Schema::create('telescope_entries', function (Blueprint $table) {
                $table->bigIncrements('sequence');
                $table->char('uuid', 36);
                $table->char('batch_id', 36);
                $table->string('family_hash', 255)->nullable();
                $table->boolean('should_display_on_index')->default(true);
                $table->string('type', 20);
                $table->longText('content');
                $table->dateTime('created_at')->nullable();
                $table->unique('uuid', 'telescope_entries_uuid_unique');
                $table->index('batch_id', 'telescope_entries_batch_id_index');
                $table->index('family_hash', 'telescope_entries_family_hash_index');
                $table->index('created_at', 'telescope_entries_created_at_index');
                $table->index(['type', 'should_display_on_index'], 'telescope_entries_type_should_display_on_index_index');
            });
        }

        // === telescope_entries_tags ===
        if (!Schema::hasTable('telescope_entries_tags')) {
            Schema::create('telescope_entries_tags', function (Blueprint $table) {
                $table->char('entry_uuid', 36);
                $table->string('tag', 255);
                $table->index(['entry_uuid', 'tag'], 'telescope_entries_tags_entry_uuid_tag_index');
                $table->index('tag', 'telescope_entries_tags_tag_index');
                $table->foreign('entry_uuid', 'telescope_entries_tags_entry_uuid_foreign')->references('uuid')->on('telescope_entries')->onDelete('cascade');
            });
        }

        // === telescope_monitoring ===
        if (!Schema::hasTable('telescope_monitoring')) {
            Schema::create('telescope_monitoring', function (Blueprint $table) {
                $table->string('tag', 255);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('telescope_monitoring');
        Schema::dropIfExists('telescope_entries_tags');
        Schema::dropIfExists('telescope_entries');
        Schema::dropIfExists('oauth_refresh_tokens');
        Schema::dropIfExists('oauth_auth_codes');
        Schema::dropIfExists('oauth_access_tokens');
        Schema::dropIfExists('oauth_personal_access_clients');
        Schema::dropIfExists('oauth_clients');
        Schema::dropIfExists('personal_access_tokens');
        Schema::dropIfExists('password_resets');
        Schema::dropIfExists('failed_jobs');
        Schema::dropIfExists('things_access');
        Schema::dropIfExists('history');
        Schema::dropIfExists('favorites');
        Schema::dropIfExists('links_access');
        Schema::dropIfExists('links');
        Schema::dropIfExists('external_links');
        Schema::dropIfExists('users');
        Schema::dropIfExists('classes');
        Schema::dropIfExists('photo_places');
        Schema::dropIfExists('photo_files');
        Schema::dropIfExists('photo_media');
        Schema::dropIfExists('things');
        Schema::dropIfExists('general_types');
    }
}
