<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('things', 'server_uuid')) {
            return;
        }

        Schema::table('things', function (Blueprint $table) {
            $table->uuid('server_uuid')->nullable();
        });

        $existingServerUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        if (!$existingServerUuid) {
            DB::transaction(function () {
                $serverUuid = (string) Str::uuid();

                DB::table('general_types')->upsert(
                    ['id' => 6, 'name' => 'SERVER'],
                    'id'
                );

                $firstAdmin = DB::table('users')->where('is_admin', true)->orderBy('id')->first();
                $ownerUuid = $firstAdmin?->thing_id;

                $thingData = [
                    'thing_id' => $serverUuid,
                    'name' => gethostname(),
                    'type' => 6,
                    'public' => false,
                    'deleted' => false,
                    'record_created' => now(),
                    'record_updated' => now(),
                ];

                if ($ownerUuid) {
                    $thingData['owner'] = $ownerUuid;
                }

                DB::table('things')->insert($thingData);

                DB::table('settings')->insert([
                    'key' => 'server_uuid',
                    'value' => $serverUuid,
                ]);

                DB::statement("UPDATE things SET server_uuid = '$serverUuid' WHERE server_uuid IS NULL");
            });
        } else {
            DB::statement("UPDATE things SET server_uuid = '$existingServerUuid' WHERE server_uuid IS NULL");
        }

        DB::statement('ALTER TABLE things ALTER COLUMN server_uuid SET NOT NULL');
    }

    public function down(): void
    {
        if (Schema::hasColumn('things', 'server_uuid')) {
            Schema::table('things', function (Blueprint $table) {
                $table->dropColumn('server_uuid');
            });
        }
    }
};
