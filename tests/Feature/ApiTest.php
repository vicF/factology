<?php

namespace Tests\Feature;

use App\Eloquent\Thing;
use App\User;
use App\Models\Classes\Anything;
use Fokin\Facts\Data\UUID;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\AssertionFailedError;
use Tests\TestCase;

class ApiTest extends TestCase
{
    protected static $_headers = [];
     /*   ['Authorization' => 'Bearer 1|zmxBQ7PwSWW6EClNE0bbwpQdNHSFqW31h2ygFYCE'
        ] // Token generated in the app
    ;*/

    /**
     * A basic test example.
     *
     * @return void
     */
    public function testListTest(): void
    {
        Sanctum::actingAs(
            User::factory()->make(),
            ['*']
        );
        $response = $this->getJson($uri = '/api/v1/object', self::$_headers);
        $json = $this->assertSuccess($response, "GET request to $uri has failed");
        $this->assertArrayHasKey(0, $json['data']);
        $this->assertArrayHasKey('thing_id', $json['data'][0]);
        $this->assertArrayHasKey('name', $json['data'][0]);
        $this->assertArrayHasKey('type', $json['data'][0]);
        $this->assertArrayHasKey('description', $json['data'][0]);
        $this->assertArrayHasKey('start', $json['data'][0]);
        $this->assertArrayHasKey('end', $json['data'][0]);
        $this->assertArrayHasKey(1, $json['data']);
        $response->assertStatus(200);
    }

    public function testGetTest(): void
    {
        /*Sanctum::actingAs(
            User::factory()->make(),
            ['*']
        );*/
        $response = $this->actingAs(User::factory()->make(), 'sanctum')->getJson($uri = '/api/v1/object/' . UUID::SOMETHING, self::$_headers);
        $json = $this->assertSuccess($response, "GET request to $uri has failed");
        $this->assertArrayHasKey('thing_id', $json['data']);
        $this->assertArrayHasKey('name', $json['data']);
        $this->assertArrayHasKey('type', $json['data']);
        $this->assertArrayHasKey('description', $json['data']);
        $this->assertArrayHasKey('start', $json['data']);
        $this->assertArrayHasKey('end', $json['data']);
        $response->assertStatus(200);
    }


    /**
     * @throws \Throwable
     */
    public function testCreateModifyDelete(): void
    {
        self::markTestIncomplete('Authentication required');
        $name = 'Test Object (delete me)' . base64_encode(random_bytes(50));
        $description = 'Test object created by automated test on ' . date(Anything::TIME_FORMAT) . base64_encode(random_bytes(50));
        try {
            $response = $this->putJson('/api/v1/object',
                [
                    'name'        => $name,
                    'type'        => UUID::G_THING,
                    'description' => $description,
                    'start'       => '1970-01-01',
                    'end'         => date(Anything::TIME_FORMAT),
                    'link'        => [
                        [
                            'type'        => 'c217c185-742f-4a9f-8e69-acea2b4f5aea',
                            'uuid'        => '3e15244c-a9e1-4a91-a0ca-1c65722a64df',
                            'description' => 'This test object is of class Something'
                        ]
                    ]
                ]);
            $json = $this->assertSuccess($response, 'PUT request to /api/v1/object has failed');
            $this->assertArrayHasKey('thing_id', $json['data']);

            $response = $this->deleteJson($uri = '/api/v1/object/' . $json['data']['thing_id']);
            $json = $this->assertSuccess($response, "DELETE request to $uri has failed");
        } catch (\Throwable $e) {
            // Cleanup
            @Thing::where('name', $name)->where('description', $description)->delete();
            throw $e;
        }
    }

    public function assertSuccess(TestResponse $response, $message = 'Request failed')
    {
        try {
            $this->assertEquals(200, $response->getStatusCode());
            $json = json_decode($response->getContent(), true);
            $this->assertNotEmpty($json);
            //$this->assertArrayHasKey('data', $json);
            $this->assertArrayHasKey('success', $json);
            $this->assertTrue($json['success']);
            return $json;
        } catch (\Throwable $e) {
            throw new AssertionFailedError($message . "\n" .
                substr($response->getContent(), 0, 400) . ' ...', $response->getStatusCode(), $e);
        }
    }
}