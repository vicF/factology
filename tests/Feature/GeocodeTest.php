<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;
use Tests\Traits\SafeRefreshDatabase;

/**
 * GET /api/v1/geocode — forward-geocoding proxy (address → {name, lat, lng})
 * used by the GeoPicker address search. Providers: nominatim (default, no key)
 * and yandex (requires YANDEX_GEOCODER_KEY).
 */
class GeocodeTest extends TestCase
{
    use SafeRefreshDatabase;

    /** @test */
    public function returns_nominatim_results_normalized()
    {
        Http::fake([
            'nominatim.openstreetmap.org/*' => Http::response([
                ['display_name' => 'Москва, Россия', 'lat' => '55.7558', 'lon' => '37.6173'],
                ['display_name' => 'Moscow, ID, USA', 'lat' => '46.7324', 'lon' => '-117.0002'],
            ]),
        ]);

        $res = $this->getJson('/api/v1/geocode?q=Москва');

        $res->assertStatus(200)->assertJson([
            'success' => true,
            'data' => [
                ['name' => 'Москва, Россия', 'lat' => 55.7558, 'lng' => 37.6173],
                ['name' => 'Moscow, ID, USA', 'lat' => 46.7324, 'lng' => -117.0002],
            ],
        ]);
    }

    /** @test */
    public function yandex_results_are_normalized_from_pos_and_text()
    {
        config(['services.yandex.geocoder_key' => 'test-key']);
        Http::fake([
            'geocode-maps.yandex.ru/*' => Http::response([
                'response' => [
                    'GeoObjectCollection' => [
                        'featureMember' => [
                            ['GeoObject' => [
                                'name' => 'Москва',
                                'Point' => ['pos' => '37.6173 55.7558'],
                                'metaDataProperty' => ['GeocoderMetaData' => ['text' => 'Россия, Москва']],
                            ]],
                        ],
                    ],
                ],
            ]),
        ]);

        $res = $this->getJson('/api/v1/geocode?q=Москва&provider=yandex');

        $res->assertStatus(200)->assertJson([
            'success' => true,
            'data' => [
                ['name' => 'Россия, Москва', 'lat' => 55.7558, 'lng' => 37.6173],
            ],
        ]);
    }

    /** @test */
    public function yandex_without_configured_key_returns_501()
    {
        config(['services.yandex.geocoder_key' => '']);

        $res = $this->getJson('/api/v1/geocode?q=Москва&provider=yandex');

        $res->assertStatus(501);
    }

    /** @test */
    public function rejects_missing_or_blank_query()
    {
        Http::fake(); // no upstream call expected

        $this->getJson('/api/v1/geocode')->assertStatus(422);
        $this->getJson('/api/v1/geocode?q=')->assertStatus(422);
        $this->getJson('/api/v1/geocode?q=%20%20')->assertStatus(422);
    }

    /** @test */
    public function rejects_unknown_provider()
    {
        Http::fake();

        $this->getJson('/api/v1/geocode?q=Москва&provider=google')->assertStatus(422);
    }

    /** @test */
    public function upstream_failure_returns_502()
    {
        Http::fake([
            'nominatim.openstreetmap.org/*' => Http::response('', 500),
        ]);

        $res = $this->getJson('/api/v1/geocode?q=Москва');

        $res->assertStatus(502);
    }
}
