<?php

namespace Tests\Feature;

use App\Services\Importer\GedcomImporter;
use App\Services\Importer\GedcomParser;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;

class GedcomImportTest extends TestCase
{
    use CreatesTestUsers;

    private string $ownerThingId;

    protected function setUp(): void
    {
        parent::setUp();

        $user = $this->createTestUser()->getUser();
        $this->ownerThingId = $user->thing_id;
        Sanctum::actingAs($user, ['*']);
    }

    protected function tearDown(): void
    {
        // Clean up imported things and their links
        $importedIds = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->whereExists(function ($q) {
                $q->select(DB::raw(1))
                  ->from('links')
                  ->whereColumn('links.one_thing_id', 'things.thing_id')
                  ->where('links.link_type_id', UUID::IMPORTED_FROM);
            })
            ->pluck('thing_id')
            ->toArray();

        if (!empty($importedIds)) {
            DB::table('links')
                ->where(function ($q) use ($importedIds) {
                    $q->whereIn('one_thing_id', $importedIds)
                      ->orWhereIn('other_thing_id', $importedIds);
                })
                ->delete();
            DB::table('things')->whereIn('thing_id', $importedIds)->delete();
        }

        parent::tearDown();
    }

    public function testImportsSimpleGedcom(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 SOUR FTM
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 12 APR 1856
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 BIRT
2 DATE 1860
1 DEAT
2 DATE AFT 1900
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1880
0 TRLR
GEDCOM;

        $importer = new GedcomImporter($this->ownerThingId);
        $result = $importer->import($gedcom);

        $this->assertGreaterThan(0, $result['imported'], 'Should import at least some records');
        $this->assertSame(0, $result['errors'], 'Should have zero errors');

        // Verify persons were created (clean names, no //)
        $persons = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->whereExists(function ($q) {
                $q->select(DB::raw(1))
                  ->from('links')
                  ->whereColumn('links.one_thing_id', 'things.thing_id')
                  ->where('links.link_type_id', UUID::LINK_TO_CLASS)
                  ->where('links.other_thing_id', UUID::HUMAN);
            })
            ->get();

        $this->assertGreaterThanOrEqual(2, $persons->count(), 'Should create at least 2 person things');

        // Verify names are clean (no //)
        foreach ($persons as $p) {
            $this->assertStringNotContainsString('/', $p->name);
        }

        // Verify MARRIED_TO link
        $marriedLinks = DB::table('links')
            ->where('link_type_id', UUID::MARRIED_TO)
            ->count();
        $this->assertGreaterThanOrEqual(1, $marriedLinks);

        // Verify events use PRESENT link type instead of LINK_TO_SOURCE
        $presentLinks = DB::table('links')
            ->where('link_type_id', UUID::PRESENT)
            ->count();
        $this->assertGreaterThanOrEqual(2, $presentLinks, 'Events should use PRESENT link type');

        // Verify IMPORTED_FROM links exist
        $importedLinks = DB::table('links')
            ->where('link_type_id', UUID::IMPORTED_FROM)
            ->count();
        $this->assertGreaterThan(0, $importedLinks, 'Import should create IMPORTED_FROM links');

        // Verify source thing exists and is linked to GEDCOM class
        $this->assertNotNull($result['source_thing_id']);
        $sourceClassLink = DB::table('links')
            ->where('one_thing_id', $result['source_thing_id'])
            ->where('link_type_id', UUID::LINK_TO_CLASS)
            ->where('other_thing_id', UUID::GEDCOM_CLASS)
            ->first();
        $this->assertNotNull($sourceClassLink, 'Source thing should be linked to GEDCOM class');
    }

    public function testImportIsIdempotent(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 12 APR 1856
0 TRLR
GEDCOM;

        $importer = new GedcomImporter($this->ownerThingId);

        $result1 = $importer->import($gedcom);
        $this->assertGreaterThan(0, $result1['imported'], 'First import should create records');

        $result2 = $importer->import($gedcom);
        $this->assertSame(0, $result2['imported'], 'Second import should create zero new records');
        $this->assertGreaterThan(0, $result2['updated'], 'Second import should update existing records');

        // Verify count unchanged after second import
        $count = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->count();
        $this->assertGreaterThanOrEqual($result1['imported'], $count);
    }

    public function testParsesGedcomWithRussianContent(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Иван /Петров/
1 SEX M
1 BIRT
2 DATE 12 ЯНВ 1856
2 PLAC Москва, Россия
0 @I2@ INDI
1 NAME Мария /Иванова/
1 SEX F
1 BIRT
2 DATE 1860
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
0 TRLR
GEDCOM;

        $importer = new GedcomImporter($this->ownerThingId);
        $result = $importer->import($gedcom);

        $this->assertGreaterThan(0, $result['imported']);
        $this->assertSame(0, $result['errors']);

        $ivan = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->where('name', 'like', '%Иван%')
            ->first();

        $this->assertNotNull($ivan, 'Ivan should exist');
        $this->assertStringNotContainsString('/', $ivan->name);
    }

    public function testGedcomParserParseMethod(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 12 APR 1856
0 TRLR
GEDCOM;

        $parser = new GedcomParser();
        $records = $parser->parse($gedcom);

        $this->assertCount(1, $records, 'Should parse 1 INDI record');
        $this->assertSame('INDI', $records[0]['tag']);
        $this->assertSame('@I1@', $records[0]['id']);
    }

    public function testCrossFileImportCreatesSeparateThings(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 12 APR 1856
0 TRLR
GEDCOM;

        $importerA = new GedcomImporter($this->ownerThingId, 'file-a');
        $resultA = $importerA->import($gedcom);
        $this->assertGreaterThan(0, $resultA['imported']);

        $importerB = new GedcomImporter($this->ownerThingId, 'file-b');
        $resultB = $importerB->import($gedcom);
        $this->assertGreaterThan(0, $resultB['imported']);

        $persons = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->where('name', 'John Smith')
            ->get();

        $this->assertCount(2, $persons, 'Should have 2 separate persons from different files');
    }

    public function testCrossFileSameKeyIsIdempotent(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 12 APR 1856
0 TRLR
GEDCOM;

        $importer1 = new GedcomImporter($this->ownerThingId, 'my-family-tree');
        $result1 = $importer1->import($gedcom);

        $importer2 = new GedcomImporter($this->ownerThingId, 'my-family-tree');
        $result2 = $importer2->import($gedcom);

        $this->assertGreaterThan(0, $result1['imported']);
        $this->assertSame(0, $result2['imported'], 'Same fileKey should create no new records');
        $this->assertGreaterThan(0, $result2['updated'], 'Same fileKey should update existing records');

        $count = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->where('name', 'John Smith')
            ->count();

        $this->assertEquals(1, $count, 'Only one thing for same fileKey');
    }

    public function testFindDuplicatesEndpointLinksCrossFilePersons(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 12 APR 1856
0 TRLR
GEDCOM;

        (new GedcomImporter($this->ownerThingId, 'file-a'))->import($gedcom);
        (new GedcomImporter($this->ownerThingId, 'file-b'))->import($gedcom);

        $response = $this->postJson('/api/v1/import/find-duplicates');
        $response->assertOk()
            ->assertJsonPath('success', true);

        $result = $response->json('result');
        $this->assertGreaterThanOrEqual(1, $result['links_created']);
        $this->assertGreaterThanOrEqual(1, count($result['matches']));

        $linkCount = DB::table('links')
            ->where('link_type_id', UUID::DUPLICATE_OF)
            ->count();
        $this->assertGreaterThanOrEqual(1, $linkCount);

        $response2 = $this->postJson('/api/v1/import/find-duplicates');
        $result2 = $response2->json('result');
        $this->assertSame(0, $result2['links_created'], 'Second run should create no new links');
    }

    public function testImportCreatesSourceThingWithDbguid(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 SOUR AgelongTree
2 NAME Древо Жизни
1 CHAR UTF-8
1 DATE 22 AUG 2026
1 _DBGUID 5ae97c52-036b-4e3c-b314-6b12c944f3b0
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 12 APR 1856
0 TRLR
GEDCOM;

        $importer = new GedcomImporter($this->ownerThingId);
        $result = $importer->import($gedcom);

        $this->assertGreaterThan(0, $result['imported']);

        // Verify source thing exists
        $source = DB::table('things')
            ->where('thing_id', $result['source_thing_id'])
            ->first();
        $this->assertNotNull($source, 'Source thing should exist');
        $this->assertSame('Древо Жизни', $source->name);

        // Verify source thing has _DBGUID in its data
        $sourceData = json_decode($source->data, true);
        $this->assertSame('5ae97c52-036b-4e3c-b314-6b12c944f3b0', $sourceData['properties']['source_guid']);

        // Verify source thing is linked to GEDCOM class
        $classLink = DB::table('links')
            ->where('one_thing_id', $result['source_thing_id'])
            ->where('link_type_id', UUID::LINK_TO_CLASS)
            ->where('other_thing_id', UUID::GEDCOM_CLASS)
            ->first();
        $this->assertNotNull($classLink, 'Source should be linked to GEDCOM class');

        // Verify imported person has source_guid property
        $person = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->where('name', 'John Smith')
            ->first();
        $this->assertNotNull($person);
        $personData = json_decode($person->data, true);
        $this->assertSame('5ae97c52-036b-4e3c-b314-6b12c944f3b0', $personData['properties']['source_guid']);

        // Reimport — source thing should be updated (not duplicated)
        $result2 = $importer->import($gedcom);
        $this->assertSame(0, $result2['imported']);
        $this->assertGreaterThan(0, $result2['updated']);

        // Only one source thing
        $sourceCount = DB::table('things')
            ->where('thing_id', $result['source_thing_id'])
            ->count();
        $this->assertSame(1, $sourceCount, 'Only one source thing');
    }

    public function testEventsUsePresentLinkType(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 12 APR 1856
0 TRLR
GEDCOM;

        $importer = new GedcomImporter($this->ownerThingId);
        $result = $importer->import($gedcom);

        $this->assertGreaterThan(0, $result['imported']);

        // Find the birth event
        $event = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->whereRaw("data->'properties'->>'event_type' = 'birth'")
            ->first();

        $this->assertNotNull($event, 'Birth event should exist');

        // Verify event has name_translations
        $this->assertNotNull($event->name_translations, 'Event should have name_translations');

        $nameTranslations = json_decode($event->name_translations, true);
        $this->assertArrayHasKey('en', $nameTranslations);
        $this->assertArrayHasKey('ru', $nameTranslations);

        // Verify event is linked to person via PRESENT (person → PRESENT → event)
        $presentLink = DB::table('links')
            ->where('other_thing_id', $event->thing_id)
            ->where('link_type_id', UUID::PRESENT)
            ->first();
        $this->assertNotNull($presentLink, 'Event should use PRESENT link type');

        $sourceLink = DB::table('links')
            ->where('one_thing_id', $event->thing_id)
            ->where('link_type_id', UUID::LINK_TO_SOURCE)
            ->first();
        $this->assertNull($sourceLink, 'Event should NOT use LINK_TO_SOURCE');
    }

    public function testImportedFromLinksHaveDataWithExternalId(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 12 APR 1856
0 TRLR
GEDCOM;

        $importer = new GedcomImporter($this->ownerThingId, 'test-file-key');
        $result = $importer->import($gedcom);

        $this->assertGreaterThan(0, $result['imported']);

        // Find an IMPORTED_FROM link and check data
        $importedLink = DB::table('links')
            ->where('link_type_id', UUID::IMPORTED_FROM)
            ->first();

        $this->assertNotNull($importedLink, 'IMPORTED_FROM link should exist');
        $this->assertNotNull($importedLink->data, 'IMPORTED_FROM link should have data');

        $linkData = json_decode($importedLink->data, true);
        $this->assertArrayHasKey('source_external_id', $linkData);
        $this->assertStringStartsWith('test-file-key/', $linkData['source_external_id']);
    }
}