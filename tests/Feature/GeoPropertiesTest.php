<?php

namespace Tests\Feature;

use App\Services\GeoProperties;
use PHPUnit\Framework\TestCase;

/**
 * Pure unit tests for the GeoJSON coordinate extractor used by the Map tab
 * (related-object `geo` derivation and the object detail payload).
 */
class GeoPropertiesTest extends TestCase
{
    /** @test */
    public function it_returns_empty_for_null_or_empty_input(): void
    {
        $this->assertSame([], GeoProperties::extract(null));
        $this->assertSame([], GeoProperties::extract([]));
    }

    /** @test */
    public function it_extracts_a_geojson_point(): void
    {
        $out = GeoProperties::extract([
            'prop-1' => ['type' => 'Point', 'coordinates' => [37.6173, 55.7558]],
        ]);

        $this->assertEquals([
            [
                'geometry'    => ['type' => 'Point', 'coordinates' => [37.6173, 55.7558]],
                'property_id' => 'prop-1',
            ],
        ], $out);
    }

    /** @test */
    public function it_extracts_lines_and_polygons(): void
    {
        $out = GeoProperties::extract([
            'line' => ['type' => 'LineString', 'coordinates' => [[37.6, 55.7], [37.7, 55.8]]],
            'poly' => ['type' => 'Polygon', 'coordinates' => [[[37.6, 55.7], [37.7, 55.8], [37.6, 55.7]]]],
        ]);

        $this->assertCount(2, $out);
        $this->assertEquals('LineString', $out[0]['geometry']['type']);
        $this->assertEquals('Polygon', $out[1]['geometry']['type']);
    }

    /** @test */
    public function it_accepts_height_in_geojson_coordinates(): void
    {
        $out = GeoProperties::extract([
            'p' => ['type' => 'Point', 'coordinates' => [37.6173, 55.7558, 120.5]],
        ]);

        $this->assertSame([37.6173, 55.7558, 120.5], $out[0]['geometry']['coordinates']);
    }

    /** @test */
    public function it_normalizes_legacy_lat_lng_to_a_point(): void
    {
        $out = GeoProperties::extract([
            'prop-1' => ['lat' => 55.7558, 'lng' => 37.6173],
        ]);

        $this->assertEquals([
            [
                'geometry'    => ['type' => 'Point', 'coordinates' => [37.6173, 55.7558]],
                'property_id' => 'prop-1',
            ],
        ], $out);
    }

    /** @test */
    public function it_skips_missing_or_unknown_types(): void
    {
        $this->assertSame([], GeoProperties::extract(['p' => ['coordinates' => [1, 2]]]));
        $this->assertSame([], GeoProperties::extract(['p' => ['type' => 'Circle', 'coordinates' => [1, 2]]]));
        $this->assertSame([], GeoProperties::extract(['p' => ['type' => 'Point']]));
        $this->assertSame([], GeoProperties::extract(['p' => ['type' => 'Point', 'coordinates' => 'nope']]));
    }

    /** @test */
    public function it_skips_out_of_range_coordinates(): void
    {
        $this->assertSame([], GeoProperties::extract(['p' => ['type' => 'Point', 'coordinates' => [181, 0]]]));
        $this->assertSame([], GeoProperties::extract(['p' => ['type' => 'Point', 'coordinates' => [0, 91]]]));
        $this->assertSame([], GeoProperties::extract(['p' => ['type' => 'Point', 'coordinates' => [0, null]]]));
        $this->assertSame([], GeoProperties::extract(['p' => ['lat' => 91, 'lng' => 0]]));
        $this->assertSame([], GeoProperties::extract(['p' => ['lat' => 1]]));
    }

    /** @test */
    public function it_skips_scalar_and_non_coordinate_values(): void
    {
        $this->assertSame([], GeoProperties::extract(['p' => 'Moscow']));
        $this->assertSame([], GeoProperties::extract(['p' => 42]));
        $this->assertSame([], GeoProperties::extract(['p' => ['value' => 'not geo']]));
    }

    /** @test */
    public function it_extracts_multiple_coordinate_properties(): void
    {
        $out = GeoProperties::extract([
            'a' => ['type' => 'Point', 'coordinates' => [1, 2]],
            'b' => ['type' => 'Point', 'coordinates' => [3, 4]],
            'c' => ['value' => 'not geo'],
        ]);

        $this->assertCount(2, $out);
        $this->assertEquals(['a', 'b'], array_column($out, 'property_id'));
    }
}
