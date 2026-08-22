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
        // Clean up imported things and links
        DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->where('source_service', 'gedcom')
            ->delete();

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

        // Verify persons were created
        $persons = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->where('source_service', 'gedcom')
            ->where('type', UUID::G_THING)
            ->get();

        $this->assertGreaterThanOrEqual(2, $persons->count(), 'Should create at least 2 person things');

        // Verify links were created (MARRIED_TO)
        $marriedLinks = DB::table('links')
            ->where('link_type_id', UUID::MARRIED_TO)
            ->count();
        $this->assertGreaterThanOrEqual(1, $marriedLinks, 'Should create at least one MARRIED_TO link');
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

        // First import
        $result1 = $importer->import($gedcom);
        $this->assertGreaterThan(0, $result1['imported'], 'First import should create records');

        // Second import (same data)
        $result2 = $importer->import($gedcom);
        $this->assertSame(0, $result2['imported'], 'Second import should create zero new records');

        // Verify count unchanged after second import
        $count = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->where('source_service', 'gedcom')
            ->count();
        $this->assertSame($result1['imported'], $count, 'Total things should match first import result');
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

        // Verify Russian names stored correctly
        $ivan = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->where('source_service', 'gedcom')
            ->where('name', 'like', '%Иван%')
            ->first();

        $this->assertNotNull($ivan, 'Ivan should exist in the database');
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

        // Import with fileKey 'file-a'
        $importerA = new GedcomImporter($this->ownerThingId, 'file-a');
        $resultA = $importerA->import($gedcom);
        $this->assertGreaterThan(0, $resultA['imported'], 'First import should create records');

        // Import SAME content with fileKey 'file-b' (simulating different file, same person)
        $importerB = new GedcomImporter($this->ownerThingId, 'file-b');
        $resultB = $importerB->import($gedcom);
        $this->assertGreaterThan(0, $resultB['imported'], 'Second import (different fileKey) should also create records');

        // Verify two separate things exist (not merged)
        $persons = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->where('source_service', 'gedcom')
            ->where('name', 'John /Smith/')
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

        // Import with fileKey 'my-family-tree'
        $importer1 = new GedcomImporter($this->ownerThingId, 'my-family-tree');
        $result1 = $importer1->import($gedcom);

        $importer2 = new GedcomImporter($this->ownerThingId, 'my-family-tree');
        $result2 = $importer2->import($gedcom);

        $this->assertGreaterThan(0, $result1['imported']);
        $this->assertSame(0, $result2['imported'], 'Same fileKey should dedup');

        $count = DB::table('things')
            ->where('owner', $this->ownerThingId)
            ->where('source_service', 'gedcom')
            ->where('name', 'John /Smith/')
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

        // Import same person from two "files"
        (new GedcomImporter($this->ownerThingId, 'file-a'))->import($gedcom);
        (new GedcomImporter($this->ownerThingId, 'file-b'))->import($gedcom);

        // Run the endpoint
        $response = $this->postJson('/api/v1/import/find-duplicates');
        $response->assertOk()
            ->assertJsonPath('success', true);

        $result = $response->json('result');
        $this->assertGreaterThanOrEqual(1, $result['links_created'], 'Should create at least one DUPLICATE_OF link');
        $this->assertGreaterThanOrEqual(1, count($result['matches']), 'Should report at least one match');

        // Verify the link actually exists in DB
        $linkCount = DB::table('links')
            ->where('link_type_id', UUID::DUPLICATE_OF)
            ->count();
        $this->assertGreaterThanOrEqual(1, $linkCount, 'DUPLICATE_OF link should exist in DB');

        // Running again should be a no-op (link already exists)
        $response2 = $this->postJson('/api/v1/import/find-duplicates');
        $result2 = $response2->json('result');
        $this->assertSame(0, $result2['links_created'], 'Second run should create no new links');
    }
}