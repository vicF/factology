<?php

namespace Tests\Feature;

use App\Services\Importer\GedcomImporter;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

class GedcomImportSourcesTest extends TestCase
{
    use SafeRefreshDatabase;
    use CreatesTestUsers;

    private string $ownerThingId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = $this->createTestUser()->getUser();
        $this->ownerThingId = (string) $user->thing_id;
    }

    /** @test */
    public function url_only_sources_become_external_links_on_citing_objects_not_things()
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 12 APR 1856
2 SOUR @S1@
0 @S1@ SOUR
1 TITL www.example-site.ru
1 WWW http://www.example-site.ru/page
0 TRLR
GEDCOM;

        (new GedcomImporter($this->ownerThingId))->import($gedcom);

        // No Thing is materialized for the URL-only source.
        $this->assertDatabaseMissing('things', [
            'owner' => $this->ownerThingId,
            'name'  => 'www.example-site.ru',
        ]);

        // The birth event cites it, so the URL lands as an external link on the
        // birth event instead.
        $event = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->whereRaw("data->'properties'->>'event_type' = 'birth'")
            ->first();
        $this->assertNotNull($event, 'Birth event should exist');
        $this->assertDatabaseHas('external_links', [
            'thing_id' => $event->thing_id,
            'url'      => 'http://www.example-site.ru/page',
        ]);
    }

    /** @test */
    public function uncited_url_only_sources_create_nothing()
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 CHAR UTF-8
0 @S3@ SOUR
1 TITL www.orphan-site.org
0 TRLR
GEDCOM;

        (new GedcomImporter($this->ownerThingId))->import($gedcom);

        $this->assertDatabaseMissing('things', [
            'owner' => $this->ownerThingId,
            'name'  => 'www.orphan-site.org',
        ]);
    }

    /** @test */
    public function bibliographic_sources_are_classed_under_source_and_keep_url_as_external_link()
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 CHAR UTF-8
0 @S2@ SOUR
1 TITL Указатель «Возвращенные имена»
1 PUBL Память народа
1 WWW http://pamyat-naroda.ru/book
0 TRLR
GEDCOM;

        (new GedcomImporter($this->ownerThingId))->import($gedcom);

        $source = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->where('name', 'Указатель «Возвращенные имена»')
            ->first();
        $this->assertNotNull($source, 'Bibliographic source should exist as an object');

        // Classed under the real Source class — not the EVIDENCE link type.
        $this->assertDatabaseHas('links', [
            'one_thing_id'   => $source->thing_id,
            'link_type_id'   => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::SOURCE_CLASS,
        ]);
        $this->assertDatabaseMissing('links', [
            'one_thing_id'   => $source->thing_id,
            'link_type_id'   => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::EVIDENCE,
        ]);

        // Its web URL is stored as an external link on the source object.
        $this->assertDatabaseHas('external_links', [
            'thing_id' => $source->thing_id,
            'url'      => 'http://pamyat-naroda.ru/book',
        ]);
    }

    /** @test */
    public function cited_bibliographic_source_gets_a_citation_link_from_the_event()
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 12 APR 1856
2 SOUR @S2@
0 @S2@ SOUR
1 TITL Метрическая книга
1 PUBL Архив
1 WWW http://example.org/metric
0 TRLR
GEDCOM;

        (new GedcomImporter($this->ownerThingId))->import($gedcom);

        $source = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->where('name', 'Метрическая книга')
            ->first();
        $event = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->whereRaw("data->'properties'->>'event_type' = 'birth'")
            ->first();
        $this->assertNotNull($source);
        $this->assertNotNull($event);

        // source --is an evidence of--> event citation edge.
        $this->assertDatabaseHas('links', [
            'one_thing_id'   => $source->thing_id,
            'link_type_id'   => UUID::EVIDENCE,
            'other_thing_id' => $event->thing_id,
        ]);
    }
}
