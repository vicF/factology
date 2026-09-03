<?php

namespace Tests\Feature;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

class CleanupUrlSourcesTest extends TestCase
{
    use SafeRefreshDatabase;
    use CreatesTestUsers;

    private string $ownerThingId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = $this->createTestUser()->getUser();
        $this->ownerThingId = (string) $user->thing_id;
        Sanctum::actingAs($user, ['*']);
    }

    private function insertThing(string $name): string
    {
        $id = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $id,
            'name'        => $name,
            'type'        => UUID::G_THING,
            'owner'       => $this->ownerThingId,
            'public'      => false,
            'deleted'     => false,
            'server_uuid' => DB::table('settings')->where('key', 'server_uuid')->value('value'),
        ]);
        return $id;
    }

    /** Legacy importer wiring: junk source thing → EVIDENCE node via "is inside". */
    private function linkToEvidence(string $junkId): void
    {
        DB::table('links')->insert([
            'link_uuid'      => (string) Str::uuid(),
            'one_thing_id'   => $junkId,
            'link_type_id'   => UUID::INSIDE,
            'other_thing_id' => UUID::EVIDENCE,
            'deleted'        => false,
        ]);
    }

    /** @test */
    public function dry_run_deletes_nothing()
    {
        $junk = $this->insertThing('www.booksite.ru');
        $this->linkToEvidence($junk);
        $titled = $this->insertThing('Указатель «Возвращенные имена»');
        $this->linkToEvidence($titled);

        $this->artisan('factology:cleanup-url-sources')->assertSuccessful();

        $this->assertDatabaseHas('things', ['thing_id' => $junk]);
        $this->assertDatabaseHas('things', ['thing_id' => $titled]);
    }

    /** @test */
    public function commit_deletes_url_junk_and_keeps_titled_sources()
    {
        $junk = $this->insertThing('www.booksite.ru');
        $this->linkToEvidence($junk);
        $titled = $this->insertThing('Указатель «Возвращенные имена»');
        $this->linkToEvidence($titled);

        $this->artisan('factology:cleanup-url-sources', ['--commit' => true])->assertSuccessful();

        $this->assertDatabaseMissing('things', ['thing_id' => $junk]);
        $this->assertDatabaseHas('things', ['thing_id' => $titled]);
    }

    /** @test */
    public function commit_rehomes_url_onto_referencing_objects_before_deleting()
    {
        $junk = $this->insertThing('forum.vgd.ru');
        $this->linkToEvidence($junk);

        // A real object that references the junk source.
        $eventId = $this->insertThing('Birth: John');
        DB::table('links')->insert([
            'link_uuid'      => (string) Str::uuid(),
            'one_thing_id'   => $eventId,
            'link_type_id'   => UUID::PRESENT,
            'other_thing_id' => $junk,
            'deleted'        => false,
        ]);

        $this->artisan('factology:cleanup-url-sources', ['--commit' => true])->assertSuccessful();

        $this->assertDatabaseMissing('things', ['thing_id' => $junk]);
        $this->assertDatabaseHas('external_links', [
            'thing_id' => $eventId,
            'url'      => 'http://forum.vgd.ru',
        ]);
        $this->assertDatabaseHas('things', ['thing_id' => $eventId]);
    }
}
