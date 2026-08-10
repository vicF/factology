<?php

namespace Tests\Feature;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use Tests\Traits\SafeRefreshDatabase;

class ExportSystemObjectsTest extends TestCase
{
    use SafeRefreshDatabase;

    /** @test */
    public function export_writes_valid_json()
    {
        $path = $this->tempExportPath();

        Artisan::call('factology:export-system-objects', ['--path' => $path]);

        $this->assertFileExists($path);
        $data = json_decode(file_get_contents($path), true);

        $this->assertSame(1, $data['version']);
        $this->assertSame('system', $data['scope']);
        $this->assertArrayHasKey('general_types', $data);
        $this->assertArrayHasKey('things', $data['data']);
        $this->assertArrayHasKey('links', $data['data']);
        $this->assertArrayHasKey('classes', $data['data']);

        foreach ($data['data']['things'] as $thing) {
            $this->assertArrayNotHasKey('server_uuid', $thing);
            $this->assertArrayNotHasKey('imported_at', $thing);
        }

        @unlink($path);
    }

    /** @test */
    public function export_includes_system_owned_and_reserved_but_not_user_owned()
    {
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        $systemThingId = uuid_create();
        $userThingId = uuid_create();

        DB::table('things')->insert([
            ['thing_id' => $systemThingId, 'name' => 'System Object', 'type' => UUID::G_THING, 'public' => true, 'owner' => UUID::SYSTEM_OWNER, 'server_uuid' => $serverUuid],
            ['thing_id' => $userThingId,   'name' => 'User Object',   'type' => UUID::G_THING, 'public' => true, 'owner' => uuid_create(),      'server_uuid' => $serverUuid],
        ]);

        $path = $this->tempExportPath();
        Artisan::call('factology:export-system-objects', ['--path' => $path]);
        $data = json_decode(file_get_contents($path), true);

        $ids = array_column($data['data']['things'], 'thing_id');

        $this->assertContains($systemThingId, $ids);
        $this->assertNotContains($userThingId, $ids);
        $this->assertContains(UUID::EVERYTHING, $ids); // reserved bootstrap always exported

        @unlink($path);
    }

    /** @test */
    public function export_includes_only_links_between_exported_things()
    {
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        $a = uuid_create();
        $b = uuid_create();
        $c = uuid_create();

        DB::table('things')->insert([
            ['thing_id' => $a, 'name' => 'A', 'type' => UUID::G_THING, 'public' => true, 'owner' => UUID::SYSTEM_OWNER, 'server_uuid' => $serverUuid],
            ['thing_id' => $b, 'name' => 'B', 'type' => UUID::G_THING, 'public' => true, 'owner' => UUID::SYSTEM_OWNER, 'server_uuid' => $serverUuid],
            ['thing_id' => $c, 'name' => 'C', 'type' => UUID::G_THING, 'public' => true, 'owner' => uuid_create(),      'server_uuid' => $serverUuid],
        ]);

        DB::table('links')->insert([
            ['link_uuid' => uuid_create(), 'one_thing_id' => $a, 'link_type_id' => UUID::LINK_TO_PARENT, 'other_thing_id' => $b, 'public' => true],
            ['link_uuid' => uuid_create(), 'one_thing_id' => $a, 'link_type_id' => UUID::LINK_TO_PARENT, 'other_thing_id' => $c, 'public' => true],
        ]);

        $path = $this->tempExportPath();
        Artisan::call('factology:export-system-objects', ['--path' => $path]);
        $data = json_decode(file_get_contents($path), true);

        $pairs = array_map(fn($l) => [$l['one_thing_id'], $l['other_thing_id']], $data['data']['links']);

        $this->assertContains([$a, $b], $pairs);
        $this->assertNotContains([$a, $c], $pairs);

        @unlink($path);
    }

    /** @test */
    public function export_decodes_the_data_column()
    {
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        $thingId = uuid_create();

        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'With Data',
            'type'        => UUID::G_THING,
            'public'      => true,
            'owner'       => UUID::SYSTEM_OWNER,
            'data'        => json_encode(['key' => 'value']),
            'server_uuid' => $serverUuid,
        ]);

        $path = $this->tempExportPath();
        Artisan::call('factology:export-system-objects', ['--path' => $path]);
        $data = json_decode(file_get_contents($path), true);

        $thing = collect($data['data']['things'])->firstWhere('thing_id', $thingId);

        $this->assertIsArray($thing['data']);
        $this->assertSame('value', $thing['data']['key']);

        @unlink($path);
    }

    private function tempExportPath(): string
    {
        return sys_get_temp_dir() . '/system-objects-test-' . uniqid() . '.json';
    }
}
