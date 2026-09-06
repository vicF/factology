<?php

namespace Tests\Feature;

use App\Models\User;
use Fokin\Facts\Data\UUID;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

class ImportExportTest extends TestCase
{
    use SafeRefreshDatabase, CreatesTestUsers;

    protected const API_PREFIX = '/api/v1';

    // ──────────────────────────────────────────────
    //   Export is accessible to authenticated users
    //   (Streaming response — we only check status code)
    // ──────────────────────────────────────────────

    /** @test */
    public function non_admin_can_access_export()
    {
        $user = $this->createTestUser()->getUser();
        $user->thing_id = $this->createUserThing($user);
        $user->save();

        Sanctum::actingAs($user, ['*']);

        $response = $this->get(self::API_PREFIX . '/export');

        $response->assertStatus(200);
    }

    /** @test */
    public function non_admin_exports_everything_they_can_see()
    {
        $user = $this->createTestUser()->getUser();
        $user->thing_id = $this->createUserThing($user);
        $user->save();
        Sanctum::actingAs($user, ['*']);

        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        // Public thing owned by someone else (visible) and a private foreign
        // thing (must stay hidden).
        $publicThing = uuid_create();
        $hiddenThing = uuid_create();
        $otherOwner = uuid_create();
        DB::table('things')->insert([
            ['thing_id' => $publicThing, 'name' => 'Public Thing', 'type' => UUID::G_THING, 'public' => true, 'owner' => $otherOwner, 'server_uuid' => $serverUuid],
            ['thing_id' => $hiddenThing, 'name' => 'Hidden Thing', 'type' => UUID::G_THING, 'public' => false, 'owner' => $otherOwner, 'server_uuid' => $serverUuid],
        ]);

        // Link between the user's thing and the public thing (visible), and a
        // link from the public thing into the hidden thing (not visible).
        DB::table('links')->insert([
            'link_uuid'      => uuid_create(),
            'one_thing_id'   => $user->thing_id,
            'link_type_id'   => UUID::PRESENT,
            'other_thing_id' => $publicThing,
            'public'         => true,
        ]);
        DB::table('links')->insert([
            'link_uuid'      => uuid_create(),
            'one_thing_id'   => $publicThing,
            'link_type_id'   => UUID::PRESENT,
            'other_thing_id' => $hiddenThing,
            'public'         => true,
        ]);

        $response = $this->get(self::API_PREFIX . '/export');
        $response->assertStatus(200);

        // The export is a streamed response — run the stream callback to
        // capture the produced JSON.
        ob_start();
        $response->baseResponse->sendContent();
        $content = ob_get_clean();

        $this->assertStringContainsString($publicThing, $content);
        $this->assertStringContainsString($user->thing_id, $content);
        $this->assertStringNotContainsString($hiddenThing, $content);
    }

    /** @test */
    public function admin_can_access_export()
    {
        $admin = $this->createAdminUser();
        $admin->thing_id = $this->createUserThing($admin);
        $admin->save();

        Sanctum::actingAs($admin, ['*']);

        $response = $this->get(self::API_PREFIX . '/export');

        $response->assertStatus(200);
    }

    /** @test */
    public function unauthenticated_user_cannot_export()
    {
        $response = $this->getJson(self::API_PREFIX . '/export');

        $response->assertStatus(401);
    }

    // ──────────────────────────────────────────────
    //   Non-admin can import data (owner overridden)
    // ──────────────────────────────────────────────

    /** @test */
    public function non_admin_can_import()
    {
        $user = $this->createTestUser()->getUser();
        $user->thing_id = $this->createUserThing($user);
        $user->save();

        Sanctum::actingAs($user, ['*']);

        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        $thingId = uuid_create();

        $importData = [
            'version' => 1,
            'data' => [
                'things' => [
                    [
                        'thing_id'    => $thingId,
                        'name'        => 'User Imported Thing',
                        'type'        => UUID::G_THING,
                        'public'      => false,
                        'server_uuid' => $serverUuid,
                    ],
                ],
                'links' => [],
            ],
        ];

        $response = $this->post(self::API_PREFIX . '/import', [
            'file'          => UploadedFile::fake()->createWithContent('export.json', json_encode($importData)),
            'conflict_mode' => 'overwrite',
        ], ['Accept' => 'application/json']);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'result'  => [
                'imported' => ['things' => 1, 'links' => 0],
            ],
        ]);

        // Non-admin import should set owner to the importing user
        $this->assertDatabaseHas('things', [
            'thing_id' => $thingId,
            'owner'    => $user->thing_id,
        ]);
    }

    // ──────────────────────────────────────────────
    //   Non-admin cannot overwrite another user's thing
    // ──────────────────────────────────────────────

    /** @test */
    public function non_admin_skips_others_things()
    {
        $user = $this->createTestUser()->getUser();
        $user->thing_id = $this->createUserThing($user);
        $user->save();

        Sanctum::actingAs($user, ['*']);

        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        // Create a thing owned by someone else
        $otherOwnerId = uuid_create();
        $thingId = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'Not Mine',
            'type'        => UUID::G_THING,
            'public'      => false,
            'owner'       => $otherOwnerId,
            'server_uuid' => $serverUuid,
        ]);

        $importData = [
            'version' => 1,
            'data' => [
                'things' => [
                    [
                        'thing_id'    => $thingId,
                        'name'        => 'Trying to Hijack',
                        'type'        => UUID::G_THING,
                        'public'      => false,
                        'server_uuid' => $serverUuid,
                    ],
                ],
                'links' => [],
            ],
        ];

        $response = $this->post(self::API_PREFIX . '/import', [
            'file'          => UploadedFile::fake()->createWithContent('export.json', json_encode($importData)),
            'conflict_mode' => 'overwrite',
        ], ['Accept' => 'application/json']);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'result'  => [
                'imported' => ['things' => 0, 'links' => 0],
                'skipped'  => ['things' => 1, 'links' => 0],
            ],
        ]);

        // Verify original data is untouched
        $this->assertDatabaseHas('things', [
            'thing_id' => $thingId,
            'name'     => 'Not Mine',
        ]);
    }

    // ──────────────────────────────────────────────
    //   Import things successfully (admin)
    // ──────────────────────────────────────────────

    /** @test */
    public function can_import_things()
    {
        $admin = $this->createAdminUser();
        Sanctum::actingAs($admin, ['*']);

        $thingId = uuid_create();
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        $importData = [
            'version' => 1,
            'data' => [
                'things' => [
                    [
                        'thing_id'    => $thingId,
                        'name'        => 'Imported Thing',
                        'type'        => UUID::G_THING,
                        'description' => 'Created via import test',
                        'start'       => '20260715',
                        'end'         => '20260716',
                        'owner'       => $admin->thing_id,
                        'public'      => true,
                        'deleted'     => false,
                        'data'        => null,
                        'server_uuid' => $serverUuid,
                    ],
                ],
                'links' => [],
            ],
        ];

        $response = $this->post(self::API_PREFIX . '/import', [
            'file'          => UploadedFile::fake()->createWithContent('export.json', json_encode($importData)),
            'conflict_mode' => 'overwrite',
        ], ['Accept' => 'application/json']);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'result'  => [
                'imported' => ['things' => 1, 'links' => 0],
                'skipped'  => ['things' => 0, 'links' => 0],
                'deleted'  => ['things' => 0, 'links' => 0],
            ],
        ]);

        $this->assertDatabaseHas('things', [
            'thing_id'    => $thingId,
            'name'        => 'Imported Thing',
            'description' => 'Created via import test',
        ]);
    }

    // ──────────────────────────────────────────────
    //   Import links successfully
    // ──────────────────────────────────────────────

    /** @test */
    public function can_import_links()
    {
        $admin = $this->createAdminUser();
        Sanctum::actingAs($admin, ['*']);

        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        $oneThingId = uuid_create();
        $otherThingId = uuid_create();
        DB::table('things')->insert([
            ['thing_id' => $oneThingId,  'name' => 'One',  'type' => UUID::G_THING, 'public' => false, 'server_uuid' => $serverUuid],
            ['thing_id' => $otherThingId, 'name' => 'Other', 'type' => UUID::G_THING, 'public' => false, 'server_uuid' => $serverUuid],
        ]);

        $linkUuid = uuid_create();

        $importData = [
            'version' => 1,
            'data' => [
                'things' => [],
                'links' => [
                    [
                        'link_uuid'    => $linkUuid,
                        'one_thing_id' => $oneThingId,
                        'link_type_id' => UUID::LINK_TO_PARENT,
                        'other_thing_id' => $otherThingId,
                        'description'  => 'Imported link',
                        'public'       => true,
                        'deleted'      => false,
                    ],
                ],
            ],
        ];

        $response = $this->post(self::API_PREFIX . '/import', [
            'file'          => UploadedFile::fake()->createWithContent('export.json', json_encode($importData)),
            'conflict_mode' => 'overwrite',
        ], ['Accept' => 'application/json']);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'result'  => [
                'imported' => ['things' => 0, 'links' => 1],
            ],
        ]);

        $this->assertDatabaseHas('links', [
            'link_uuid'    => $linkUuid,
            'one_thing_id' => $oneThingId,
            'other_thing_id' => $otherThingId,
        ]);
    }

    // ──────────────────────────────────────────────
    //   Conflict mode: keep_existing
    // ──────────────────────────────────────────────

    /** @test */
    public function keep_existing_mode_skips_existing_things()
    {
        $admin = $this->createAdminUser();
        Sanctum::actingAs($admin, ['*']);

        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        $thingId = uuid_create();

        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'Original Name',
            'type'        => UUID::G_THING,
            'public'      => false,
            'server_uuid' => $serverUuid,
        ]);

        $importData = [
            'version' => 1,
            'data' => [
                'things' => [
                    [
                        'thing_id'    => $thingId,
                        'name'        => 'Updated Name',
                        'type'        => UUID::G_THING,
                        'public'      => false,
                        'server_uuid' => $serverUuid,
                    ],
                ],
                'links' => [],
            ],
        ];

        $response = $this->post(self::API_PREFIX . '/import', [
            'file'          => UploadedFile::fake()->createWithContent('export.json', json_encode($importData)),
            'conflict_mode' => 'keep_existing',
        ], ['Accept' => 'application/json']);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'result'  => [
                'imported' => ['things' => 0, 'links' => 0],
                'skipped'  => ['things' => 1, 'links' => 0],
            ],
        ]);

        $this->assertDatabaseHas('things', [
            'thing_id' => $thingId,
            'name'     => 'Original Name',
        ]);
    }

    // ──────────────────────────────────────────────
    //   Conflict mode: overwrite
    // ──────────────────────────────────────────────

    /** @test */
    public function overwrite_mode_replaces_existing_things()
    {
        $admin = $this->createAdminUser();
        Sanctum::actingAs($admin, ['*']);

        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        $thingId = uuid_create();

        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'Original Name',
            'type'        => UUID::G_THING,
            'public'      => false,
            'server_uuid' => $serverUuid,
        ]);

        $importData = [
            'version' => 1,
            'data' => [
                'things' => [
                    [
                        'thing_id'    => $thingId,
                        'name'        => 'Overwritten Name',
                        'type'        => UUID::G_THING,
                        'public'      => false,
                        'server_uuid' => $serverUuid,
                    ],
                ],
                'links' => [],
            ],
        ];

        $response = $this->post(self::API_PREFIX . '/import', [
            'file'          => UploadedFile::fake()->createWithContent('export.json', json_encode($importData)),
            'conflict_mode' => 'overwrite',
        ], ['Accept' => 'application/json']);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'result'  => [
                'imported' => ['things' => 1, 'links' => 0],
            ],
        ]);

        $this->assertDatabaseHas('things', [
            'thing_id' => $thingId,
            'name'     => 'Overwritten Name',
        ]);
    }

    // ──────────────────────────────────────────────
    //   server_uuid is required — missing = 422
    // ──────────────────────────────────────────────

    /** @test */
    public function import_rejects_missing_server_uuid()
    {
        $admin = $this->createAdminUser();
        Sanctum::actingAs($admin, ['*']);

        $thingId = uuid_create();

        $importData = [
            'version' => 1,
            'data' => [
                'things' => [
                    [
                        'thing_id' => $thingId,
                        'name'     => 'No Server UUID',
                        'type'     => UUID::G_THING,
                        'public'   => false,
                    ],
                ],
                'links' => [],
            ],
        ];

        $response = $this->post(self::API_PREFIX . '/import', [
            'file'          => UploadedFile::fake()->createWithContent('export.json', json_encode($importData)),
            'conflict_mode' => 'overwrite',
        ], ['Accept' => 'application/json']);

        $response->assertStatus(422);
        $response->assertJson([
            'success' => false,
        ]);
        $this->assertStringContainsString('server_uuid', $response->json('message'));
    }

    // ──────────────────────────────────────────────
    //   Import handles deletion
    // ──────────────────────────────────────────────

    /** @test */
    public function import_can_mark_things_as_deleted()
    {
        $admin = $this->createAdminUser();
        Sanctum::actingAs($admin, ['*']);

        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        $thingId = uuid_create();

        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'To Be Deleted',
            'type'        => UUID::G_THING,
            'public'      => false,
            'deleted'     => false,
            'server_uuid' => $serverUuid,
        ]);

        $importData = [
            'version' => 1,
            'data' => [
                'things' => [
                    [
                        'thing_id'    => $thingId,
                        'name'        => 'To Be Deleted',
                        'type'        => UUID::G_THING,
                        'public'      => false,
                        'deleted'     => true,
                        'server_uuid' => $serverUuid,
                    ],
                ],
                'links' => [],
            ],
        ];

        $response = $this->post(self::API_PREFIX . '/import', [
            'file'          => UploadedFile::fake()->createWithContent('export.json', json_encode($importData)),
            'conflict_mode' => 'overwrite',
        ], ['Accept' => 'application/json']);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'result'  => [
                'deleted' => ['things' => 1, 'links' => 0],
            ],
        ]);

        $this->assertDatabaseHas('things', [
            'thing_id' => $thingId,
            'deleted'  => true,
        ]);
    }

    // ──────────────────────────────────────────────
    //   Helpers
    // ──────────────────────────────────────────────

    private function createAdminUser(): User
    {
        $userClass = $this->createTestUser([
            'name' => 'Admin User',
            'email' => 'admin_import_test@example.com',
        ]);
        $user = $userClass->getUser();
        $user->is_admin = true;
        $user->save();
        return $user;
    }

    private function createUserThing(User $user): string
    {
        $thingId = uuid_create();
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'thing-' . $user->name,
            'description' => 'Things record for user ' . $user->email,
            'type'        => 3,
            'owner'       => $thingId,
            'public'      => false,
            'server_uuid' => $serverUuid,
        ]);
        return $thingId;
    }
}
