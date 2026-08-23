<?php

namespace Tests\Unit;

use App\Services\Importer\GedcomParser;
use Tests\TestCase;

class GedcomParserTest extends TestCase
{
    public function testParsesBasicGedcom(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 SOUR FTM
2 NAME Family Tree Maker
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 12 APR 1856
2 PLAC London, England
1 DEAT
2 DATE BEF 1900
1 FAMC @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 BIRT
2 DATE 1860
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1880
0 TRLR
GEDCOM;

        $parser = new GedcomParser();
        $records = $parser->parse($gedcom);

        $this->assertCount(3, $records, 'Should parse 3 records (2 INDI + 1 FAM)');

        // Check first INDI record
        $this->assertSame('@I1@', $records[0]['id']);
        $this->assertSame('INDI', $records[0]['tag']);

        $nameNode = GedcomParser::findChild($records[0], 'NAME');
        $this->assertNotNull($nameNode);
        $this->assertSame('John /Smith/', $nameNode['value']);

        $sexNode = GedcomParser::findChild($records[0], 'SEX');
        $this->assertNotNull($sexNode);
        $this->assertSame('M', $sexNode['value']);

        // Check BIRT event
        $birtNode = GedcomParser::findChild($records[0], 'BIRT');
        $this->assertNotNull($birtNode);
        $dateNode = GedcomParser::findChild($birtNode, 'DATE');
        $this->assertNotNull($dateNode);
        $this->assertSame('12 APR 1856', $dateNode['value']);

        // Check DEAT event with qualifier
        $dateConverted = GedcomParser::parseGedcomDate('BEF 1900');
        $this->assertStringContainsString('before', $dateConverted);
        $this->assertStringContainsString('1900', $dateConverted);

        // Check FAM record
        $this->assertSame('@F1@', $records[2]['id']);
        $this->assertSame('FAM', $records[2]['tag']);

        $husbNode = GedcomParser::findChild($records[2], 'HUSB');
        $this->assertSame('@I1@', $husbNode['value']);
    }

    public function testParsesDateQualifiers(): void
    {
        $this->assertStringContainsString('before', GedcomParser::parseGedcomDate('BEF 12 APR 1856'));
        $this->assertStringContainsString('after', GedcomParser::parseGedcomDate('AFT 30 NOV 2000'));
        $this->assertStringContainsString('between', GedcomParser::parseGedcomDate('BET 1900 AND 1910'));
        $this->assertStringContainsString('about', GedcomParser::parseGedcomDate('ABT 1900'));
        $this->assertStringContainsString('about', GedcomParser::parseGedcomDate('EST 1900'));
        $this->assertStringContainsString('about', GedcomParser::parseGedcomDate('CAL 1900'));
        $this->assertStringContainsString('between', GedcomParser::parseGedcomDate('FROM 1900 TO 1910'));

        // Date conversion
        $result = GedcomParser::parseGedcomDate('12 APR 1856');
        $this->assertNotNull($result);
        $this->assertStringContainsString('1856-04-12', $result);
    }

    public function testExtractsPlaceName(): void
    {
        $node = [
            'tag' => 'PLAC',
            'value' => 'London, England, United Kingdom',
            'children' => [],
        ];

        $name = GedcomParser::extractPlaceName($node);
        $this->assertSame('London', $name);
    }

    public function testHandlesContinuation(): void
    {
        $node = [
            'tag' => 'NOTE',
            'value' => 'This is a long',
            'children' => [
                ['tag' => 'CONC', 'value' => ' note that continues', 'children' => []],
                ['tag' => 'CONT', 'value' => 'And this is a new paragraph', 'children' => []],
            ],
        ];

        $full = GedcomParser::getFullValue($node);
        $this->assertSame("This is a long note that continues\nAnd this is a new paragraph", $full);
    }

    public function testParsesRussianMonthDates(): void
    {
        // Test Russian month abbreviations
        $date = GedcomParser::parseGedcomDate('12 ЯНВ 1856');
        // The parseGedcomDate should handle Russian months
        $this->assertNotNull($date);
    }

    public function testParsesCoordinates(): void
    {
        $placeNode = [
            'tag' => 'PLAC',
            'value' => 'Moscow',
            'children' => [
                [
                    'tag' => 'MAP',
                    'children' => [
                        ['tag' => 'LATI', 'value' => 'N55.7558', 'children' => []],
                        ['tag' => 'LONG', 'value' => 'E37.6173', 'children' => []],
                    ],
                ],
            ],
        ];

        $coords = GedcomParser::extractPlaceCoordinates($placeNode);
        $this->assertNotNull($coords);
        $this->assertSame(55.7558, $coords['lat']);
        $this->assertSame(37.6173, $coords['lng']);
    }

    public function testParsesHeadMetadata(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 SOUR AgelongTree
2 NAME Древо Жизни
2 VERS 6.1.9
2 CORP Genery.com
1 CHAR UTF-8
1 DATE 22 AUG 2026
1 _DBGUID 5ae97c52-036b-4e3c-b314-6b12c944f3b0
0 @I1@ INDI
1 NAME John /Smith/
0 TRLR
GEDCOM;

        $meta = GedcomParser::parseHeadMetadata($gedcom);

        $this->assertSame('5ae97c52-036b-4e3c-b314-6b12c944f3b0', $meta['dbguid']);
        $this->assertSame('AgelongTree', $meta['source_name']);
        $this->assertSame('Древо Жизни', $meta['source_fullname']);
        $this->assertSame('22 AUG 2026', $meta['export_date']);
    }

    public function testParsesHeadMetadataWithoutDbguid(): void
    {
        $gedcom = <<<GEDCOM
0 HEAD
1 SOUR FTM
2 NAME Family Tree Maker
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
0 TRLR
GEDCOM;

        $meta = GedcomParser::parseHeadMetadata($gedcom);

        $this->assertNull($meta['dbguid']);
        $this->assertSame('FTM', $meta['source_name']);
        $this->assertSame('Family Tree Maker', $meta['source_fullname']);
    }
}