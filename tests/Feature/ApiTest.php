<?php

namespace Tests\Feature;

use App\Eloquent\Thing;
use App\Models\User;
use App\Models\Classes\Everything;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\AssertionFailedError;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;

class ApiTest extends TestCase
{
    use CreatesTestUsers;
    protected static $_headers = [];

    /**
     * Default data for creating/updating objects
     */
    protected function getDefaultObjectData(array $overrides = []): array
    {
        $uuid = uuid_create();

        $defaultData = [
            'thing_id'    => $uuid,
            'name'        => 'Test Object - ' . $uuid,
            'type'        => UUID::G_THING,
            'description' => 'Test object created on ' . date('Y-m-d H:i:s') . ' - ' . $uuid,
            'start'       => date('Ymd', strtotime('-1 day')), // Yesterday in YYYYMMDD format
            'end'         => date('Ymd'), // Today in YYYYMMDD format
            'public'      => 1,
            'link'        => [
                [
                    'type'        => 'c217c185-742f-4a9f-8e69-acea2b4f5aea',
                    'uuid'        => UUID::SOMETHING,
                    'description' => 'This test object is of class Something'
                ]
            ]
        ];

        return array_merge($defaultData, $overrides);
    }

    /**
     * Get a minimal version of object data (for tests that don't need all fields)
     */
    protected function getMinimalObjectData(array $overrides = []): array
    {
        $uuid = uuid_create();

        $minimalData = [
            'thing_id'    => $uuid,
            'name'        => 'Minimal Test Object',
            'type'        => UUID::G_THING,
            'description' => 'Minimal test object description',
            'start'       => date('Ymd'),
            'end'         => date('Ymd', strtotime('+1 day')),
            'public'      => 1,
        ];

        return array_merge($minimalData, $overrides);
    }

    /**
     * Create a test object and return its ID
     */
    protected function createTestObject(User $user, array $data = []): string
    {
        // Important: Set thing_id on the user before creating object
        if (!isset($user->thing_id) || !$user->thing_id) {
            $user->thing_id = $this->createUserThing($user);
            $user->save();
        }

        Sanctum::actingAs($user, ['*']);

        $uuid = uuid_create();
        $createUri = '/api/v1/object/' . $uuid;

        $objectData = $this->getDefaultObjectData(array_merge(
            ['thing_id' => $uuid],
            $data
        ));

        $json = $this->postApi($createUri, $objectData);

        if (!isset($json['data']['thing_id'])) {
            $this->fail('Failed to create test object: ' . json_encode($json));
        }

        return $json['data']['thing_id'];
    }

    /**
     * Get the full object data for updates (includes all required fields)
     */
    protected function getFullObjectDataForUpdate(string $thingId, array $overrides = []): array
    {
        // First, get the existing object data
        $getUri = '/api/v1/object/' . $thingId;
        $json = $this->getApi($getUri);

        if (!isset($json['data'])) {
            $this->fail('Could not retrieve object data for update: ' . json_encode($json));
        }

        $existingData = $json['data'];

        // Prepare update data with all required fields
        $updateData = [
            'thing_id'    => $existingData['thing_id'] ?? $thingId,
            'name'        => $existingData['name'] ?? 'Updated Name',
            'type'        => $existingData['type'] ?? UUID::G_THING,
            'description' => $existingData['description'] ?? 'Updated description',
            'start'       => $existingData['start'] ?? date('Ymd'),
            'end'         => $existingData['end'] ?? date('Ymd', strtotime('+1 day')),
            'public'      => $existingData['public'] ?? 1,
        ];

        // Add link if it exists in original data
        if (isset($existingData['link'])) {
            $updateData['link'] = $existingData['link'];
        }

        return array_merge($updateData, $overrides);
    }

    /**
     * Common method to call API endpoints with validation
     *
     * @param string $method HTTP method (get, post, put, delete, etc.)
     * @param string $uri Request URI
     * @param array $data Request data
     * @param int $expectedStatus Expected HTTP status code
     * @param array $headers Additional headers
     * @return array Decoded JSON response
     * @throws AssertionFailedError
     */
    protected function callApi(string $method, string $uri, array $data = [], int $expectedStatus = 200, array $headers = []): array
    {
        // Convert method to the actual callable method name
        $method = strtolower($method);

        // Make the request based on method
        $response = null;

        switch ($method) {
            case 'get':
                $response = $this->getJson($uri, $headers);
                break;
            case 'post':
                $response = $this->postJson($uri, $data, $headers);
                break;
            case 'put':
                $response = $this->putJson($uri, $data, $headers);
                break;
            case 'delete':
                $response = $this->deleteJson($uri, $data, $headers);
                break;
            default:
                throw new \InvalidArgumentException("Unsupported HTTP method: {$method}");
        }

        // Get request details for error reporting
        $requestMethod = strtoupper($method);
        $requestDetails = "{$requestMethod} {$uri}";

        try {
            // Check if status code matches expected
            if ($response->getStatusCode() !== $expectedStatus) {
                $this->failWithResponseDetails(
                    "Expected status {$expectedStatus} but got {$response->getStatusCode()}",
                    $requestDetails,
                    $response
                );
            }

            // Decode response
            $json = $response->json();

            if ($json === null) {
                $this->failWithResponseDetails(
                    "Response is not valid JSON",
                    $requestDetails,
                    $response
                );
            }

            return $json;

        } catch (\Throwable $e) {
            if ($e instanceof AssertionFailedError) {
                throw $e;
            }

            $this->failWithResponseDetails(
                "Request failed: " . $e->getMessage(),
                $requestDetails,
                $response
            );
        }
    }

    /**
     * Helper method for successful requests (expects 200)
     */
    protected function callApiSuccess(string $method, string $uri, array $data = [], array $headers = []): array
    {
        return $this->callApi($method, $uri, $data, 200, $headers);
    }

    /**
     * Helper method for POST requests
     */
    protected function postApi(string $uri, array $data = [], int $expectedStatus = 200, array $headers = []): array
    {
        return $this->callApi('post', $uri, $data, $expectedStatus, $headers);
    }

    /**
     * Helper method for GET requests
     */
    protected function getApi(string $uri, array $headers = [], int $expectedStatus = 200): array
    {
        return $this->callApi('get', $uri, [], $expectedStatus, $headers);
    }

    /**
     * Helper method for PUT requests
     */
    protected function putApi(string $uri, array $data = [], int $expectedStatus = 200, array $headers = []): array
    {
        return $this->callApi('put', $uri, $data, $expectedStatus, $headers);
    }

    /**
     * Helper method for DELETE requests
     */
    protected function deleteApi(string $uri, array $data = [], int $expectedStatus = 200, array $headers = []): array
    {
        return $this->callApi('delete', $uri, $data, $expectedStatus, $headers);
    }

    /**
     * Fail with detailed response information
     */
    protected function failWithResponseDetails(string $message, string $requestDetails, TestResponse $response): void
    {
        $content = $response->getContent();
        $statusCode = $response->getStatusCode();

        // Try to parse JSON for more friendly error messages
        $json = $response->json();
        $errorDetails = '';

        if ($json && isset($json['message'])) {
            $errorDetails .= "\nMessage: " . $json['message'];
        }

        if ($json && isset($json['errors']) && is_array($json['errors'])) {
            $errorDetails .= "\nValidation Errors:";
            foreach ($json['errors'] as $field => $errors) {
                $errorDetails .= "\n  - {$field}: " . (is_array($errors) ? implode(', ', $errors) : $errors);
            }
        }

        // Truncate content if too long
        if (strlen($content) > 500 && !$errorDetails) {
            $content = substr($content, 0, 500) . '... (truncated)';
        }

        $fullMessage = sprintf(
            "%s\nRequest: %s\nStatus: %d%s\n\nFull Response:\n%s",
            $message,
            $requestDetails,
            $statusCode,
            $errorDetails,
            $content
        );

        throw new AssertionFailedError($fullMessage);
    }

    /**
     * A basic test example.
     *
     * @return void
     */
    public function testListTest(): void
    {
        $user = $this->createTestUser()->getUser();
        Sanctum::actingAs($user, ['*']);

        $json = $this->getApi('/api/v1/object');

        $this->assertArrayHasKey('data', $json);
        $this->assertIsArray($json['data']);
        $this->assertNotEmpty($json['data']);

        $this->assertArrayHasKey(0, $json['data']);
        $this->assertArrayHasKey('thing_id', $json['data'][0]);
        $this->assertArrayHasKey('name', $json['data'][0]);
        $this->assertArrayHasKey('type', $json['data'][0]);
        $this->assertArrayHasKey('description', $json['data'][0]);
        $this->assertArrayHasKey('start', $json['data'][0]);
        $this->assertArrayHasKey('end', $json['data'][0]);
    }

    public function testSearchWithClassesReturnsEachObjectOnce(): void
    {
        $user = $this->createTestUser()->getUser();
        Sanctum::actingAs($user, ['*']);

        // Object linked to two selected classes (Something AND Event): with the
        // recursive class filter the expanded set contains both, and without a
        // dedupe step the leftJoin would return this object twice.
        $thingA = $this->createTestObject($user, [
            'name' => 'Dup Class Object',
            'links_to_add' => [
                ['link_type_id' => UUID::LINK_TO_CLASS, 'other_thing_id' => UUID::SOMETHING],
                ['link_type_id' => UUID::LINK_TO_CLASS, 'other_thing_id' => UUID::EVENT],
            ],
        ]);

        // Object linked to a single selected class.
        $thingB = $this->createTestObject($user, [
            'name' => 'Single Class Object',
            'links_to_add' => [
                ['link_type_id' => UUID::LINK_TO_CLASS, 'other_thing_id' => UUID::SOMETHING],
            ],
        ]);

        $res = $this->postJson('/api/v1/object', ['classes' => [UUID::SOMETHING, UUID::EVENT]]);
        $res->assertStatus(200);

        $ids = collect($res->json('things'))->pluck('thing_id');
        $this->assertSame(
            1,
            $ids->filter(fn ($id) => $id === $thingA)->count(),
            'Object linked to two selected classes must appear exactly once'
        );
        $this->assertSame(
            1,
            $ids->filter(fn ($id) => $id === $thingB)->count(),
            'Object linked to one selected class must appear exactly once'
        );
    }

    public function testSearchWithClassesDoesNotReturnClassNodes(): void
    {
        $user = $this->createTestUser()->getUser();
        Sanctum::actingAs($user, ['*']);

        // A real object of class Event.
        $objectId = $this->createTestObject($user, [
            'name' => 'Event Member Object',
            'links_to_add' => [
                ['link_type_id' => UUID::LINK_TO_CLASS, 'other_thing_id' => UUID::EVENT],
            ],
        ]);

        // A CLASS node that is itself a member of Event (LINK_TO_CLASS). It
        // matches the same class filter but must NOT appear in the results —
        // a class-tree filter selects objects, never the class nodes.
        $classId = $this->createTestObject($user, [
            'name' => 'Leak Class Member',
            'type' => UUID::G_CLASS,
            'links_to_add' => [
                ['link_type_id' => UUID::LINK_TO_CLASS, 'other_thing_id' => UUID::EVENT],
            ],
        ]);

        // No `type` in the body: the backend must default to objects-only.
        $res = $this->postJson('/api/v1/object', ['classes' => [UUID::EVENT]]);
        $res->assertStatus(200);

        $ids = collect($res->json('things'))->pluck('thing_id');
        $this->assertTrue($ids->contains($objectId), 'The real object must be returned');
        $this->assertFalse($ids->contains($classId), 'A class node must not leak into the results');
    }

    public function testGetTest(): void
    {
        $user = $this->createTestUser()->getUser();
        $uri = '/api/v1/object/' . UUID::SOMETHING;

        $json = $this->actingAs($user, 'sanctum')
            ->getApi($uri);

        $this->assertArrayHasKey('data', $json);
        $this->assertArrayHasKey('thing_id', $json['data']);
        $this->assertArrayHasKey('name', $json['data']);
        $this->assertArrayHasKey('type', $json['data']);
        $this->assertArrayHasKey('description', $json['data']);
        $this->assertArrayHasKey('start', $json['data']);
        $this->assertArrayHasKey('end', $json['data']);
        $this->assertArrayHasKey('owner', $json['data']);
        $this->assertArrayHasKey('owner_name', $json['data']);
    }

    /**
     * Test create, read, update, and delete operations with authentication
     *
     * @throws \Throwable
     */
    public function testCreateModifyDelete(): void
    {
        // Create a user and authenticate
        $user = $this->createTestUser()->getUser();

        // Set thing_id on the user
        $user->thing_id = $this->createUserThing($user);
        $user->save();

        Sanctum::actingAs($user, ['*']);

        // Generate unique test data using the default data helper
        $uniqueId = uuid_create();
        $name = 'Test Object (delete me) - ' . $uniqueId;
        $description = 'Test object created by automated test on ' . date('Y-m-d H:i:s') . ' - ' . $uniqueId;
        $updatedDescription = $description . ' (updated)';

        // Use default data with overrides
        $requestData = $this->getDefaultObjectData([
            'thing_id'    => $uniqueId,
            'name'        => $name,
            'description' => $description,
        ]);

        // ========== CREATE ==========
        $createUri = '/api/v1/object/' . $uniqueId;
        $json = $this->postApi($createUri, $requestData);

        if (!isset($json['data']['thing_id'])) {
            $this->fail('Response does not contain thing_id: ' . json_encode($json));
        }

        $thingId = $json['data']['thing_id'];
        $this->assertNotEmpty($thingId, 'Thing ID should not be empty');

        // Verify the object was created in the database
        $this->assertDatabaseHas('things', [
            'thing_id'    => $thingId,
            'name'        => $name,
            'description' => $description,
        ]);

        // ========== READ ==========
        $getUri = '/api/v1/object/' . $thingId;
        $getJson = $this->getApi($getUri);

        $this->assertEquals($thingId, $getJson['data']['thing_id']);
        $this->assertEquals($name, $getJson['data']['name']);
        $this->assertEquals($description, $getJson['data']['description']);

        // ========== UPDATE ==========
        // Get full object data for update
        $updateData = $this->getFullObjectDataForUpdate($thingId, [
            'description' => $updatedDescription,
        ]);

        $updateUri = '/api/v1/object/' . $thingId;
        $updateJson = $this->putApi($updateUri, $updateData);

        // Verify the update in the database
        $this->assertDatabaseHas('things', [
            'thing_id'    => $thingId,
            'description' => $updatedDescription,
        ]);

        // ========== DELETE ==========
        $deleteUri = '/api/v1/object/' . $thingId;

        try {
            $deleteJson = $this->deleteApi($deleteUri);
        } catch (AssertionFailedError $e) {
            // Check if it's a 405 error
            if (str_contains($e->getMessage(), 'Expected status 200 but got 405')) {
                echo "\nDelete operation not supported on {$deleteUri}";
                $this->fail('Delete operation not supported');
            }
            throw $e;
        }

        // Verify deletion in the database
        $this->assertDatabaseMissing('things', [
            'thing_id' => $thingId,
        ]);
    }

    /**
     * Test that unauthenticated users cannot create objects
     */
    public function testCreateFailsWithoutAuthentication(): void
    {
        $uri = '/api/v1/object/' . uuid_create();

        // Use minimal data for the test
        $testData = $this->getMinimalObjectData();

        try {
            $this->postApi($uri, $testData, 401); // Expect 401
        } catch (AssertionFailedError $e) {
            // Check if it's a 405 instead of 401
            if (str_contains($e->getMessage(), 'Expected status 401 but got 405')) {
                echo "\nPOST method not allowed on {$uri} - endpoint may not exist";
                $this->markTestSkipped('The POST method is not supported for this endpoint. Check your API routes.');
            } else {
                throw $e;
            }
        }

        // If we get here without exception, the test passed
        $this->assertTrue(true);
    }

    /**
     * Test that users cannot modify objects they don't own
     */
    public function testUserCannotUpdateAnotherUsersObject(): void
    {
        // Create owner user with thing_id
        $owner = $this->createTestUser()->getUser();
        $owner->thing_id = $this->createUserThing($owner);
        $owner->save();

        // Create an object as the owner
        $thingId = $this->createTestObject($owner, [
            'name' => 'Owner\'s Object',
            'description' => 'This belongs to owner',
        ]);

        // Create a different user with their own thing_id
        $otherUser = $this->createTestUser()->getUser();
        $otherUser->thing_id = $this->createUserThing($otherUser); // Different thing_id
        $otherUser->save();

        // Get the full object data for update (as the owner)
        Sanctum::actingAs($owner, ['*']);
        $fullObjectData = $this->getFullObjectDataForUpdate($thingId, [
            'description' => 'Trying to hijack this object',
        ]);

        // Try to update with the other user
        Sanctum::actingAs($otherUser, ['*']);
        $updateUri = '/api/v1/object/' . $thingId;

        // Expect 403 (Forbidden)
        $response = $this->putJson($updateUri, $fullObjectData);

        // Assert that the response status is 403
        $this->assertEquals(403, $response->getStatusCode(),
            "Expected 403 Forbidden when user tries to update another user's object");

        // Verify the object was NOT updated in the database
        $this->assertDatabaseHas('things', [
            'thing_id' => $thingId,
            'description' => 'This belongs to owner', // Original description unchanged
        ]);

        // Clean up - authenticate as owner again to delete the object
        Sanctum::actingAs($owner, ['*']);
        $this->deleteApi('/api/v1/object/' . $thingId);
    }

    /**
     * Test creating an object with minimal required fields
     */
    public function testCreateWithMinimalFields(): void
    {
        $user = $this->createTestUser()->getUser();

        // Set thing_id on the user
        $user->thing_id = $this->createUserThing($user);
        $user->save();

        Sanctum::actingAs($user, ['*']);

        $uuid = uuid_create();
        $createUri = '/api/v1/object/' . $uuid;

        // Use minimal data
        $minimalData = $this->getMinimalObjectData([
            'thing_id' => $uuid,
        ]);

        $json = $this->postApi($createUri, $minimalData);

        $this->assertArrayHasKey('data', $json);
        $this->assertArrayHasKey('thing_id', $json['data']);

        // Clean up
        $thingId = $json['data']['thing_id'];
        $this->deleteApi('/api/v1/object/' . $thingId);
    }

    /**
     * Create a things record for a user's thing_id.
     * Required because users.thing_id FK constraint references things.thing_id.
     */
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

    /**
     * Flexible dates: search uses interval-overlap so before/after/between
     * dates match correctly.
     */
    public function testSearchDateIntervalOverlap(): void
    {
        $user = $this->createTestUser()->getUser();
        $user->thing_id = $this->createUserThing($user);
        $user->save();
        Sanctum::actingAs($user, ['*']);

        // "before 1500" — open start, bound end.
        $before1500 = $this->createTestObject($user, [
            'name'     => 'Flexible Before 1500',
            'start'    => null,
            'end'      => '15000101000000',
            'end_meta' => ['qualifier' => 'before', 'precision' => 'year'],
        ]);

        // "between 1600 and 1700" — both bounds set.
        $between1600_1700 = $this->createTestObject($user, [
            'name'       => 'Flexible Between 1600 and 1700',
            'start'      => '16000101000000',
            'end'        => '17000101000000',
            'start_meta' => ['qualifier' => 'between', 'precision' => 'year'],
        ]);

        // "after 1800" — open end.
        $after1800 = $this->createTestObject($user, [
            'name'       => 'Flexible After 1800',
            'start'      => '18000101000000',
            'end'        => null,
            'start_meta' => ['qualifier' => 'after', 'precision' => 'year'],
        ]);

        // Window 1450–1650: before-1500 and between-1600-1700 overlap; after-1800 does not.
        $res = $this->postJson('/api/v1/object', [
            'date_from' => '14500101000000',
            'date_to'   => '16500101000000',
        ]);
        $res->assertStatus(200);
        $ids = collect($res->json('things'))->pluck('thing_id');
        $this->assertTrue($ids->contains($before1500), 'A "before 1500" date must match the 1450–1650 window');
        $this->assertTrue($ids->contains($between1600_1700), 'A 1600–1700 range must overlap the 1450–1650 window');
        $this->assertFalse($ids->contains($after1800), 'An "after 1800" date must not match the 1450–1650 window');

        // Window 1650–1750: only between-1600-1700 overlaps.
        $res = $this->postJson('/api/v1/object', [
            'date_from' => '16500101000000',
            'date_to'   => '17500101000000',
        ]);
        $res->assertStatus(200);
        $ids = collect($res->json('things'))->pluck('thing_id');
        $this->assertTrue($ids->contains($between1600_1700), 'A 1600–1700 range must overlap the 1650–1750 window');
        $this->assertFalse($ids->contains($before1500), 'A "before 1500" date must not match the 1650–1750 window');
        $this->assertFalse($ids->contains($after1800), 'An "after 1800" date must not match the 1650–1750 window');
    }

    /**
     * Flexible dates: start_meta/end_meta survive a store round-trip.
     */
    public function testCreateWithFlexibleDateMeta(): void
    {
        $user = $this->createTestUser()->getUser();
        $user->thing_id = $this->createUserThing($user);
        $user->save();
        Sanctum::actingAs($user, ['*']);

        $uniqueId = uuid_create();
        $requestData = $this->getDefaultObjectData([
            'thing_id'   => $uniqueId,
            'start'      => '15000101000000',
            'end'        => '16000101000000',
            'start_meta' => [
                'qualifier' => 'approx',
                'precision' => 'year',
                'era'       => 'gregorian',
            ],
            'end_meta' => [
                'qualifier' => 'between',
                'precision' => 'year',
            ],
        ]);

        $json = $this->postApi('/api/v1/object/' . $uniqueId, $requestData);
        $this->assertArrayHasKey('thing_id', $json['data']);
        $this->assertSame('approx', $json['data']['start_meta']['qualifier']);
        $this->assertSame('between', $json['data']['end_meta']['qualifier']);

        $row = DB::table('things')->where('thing_id', $uniqueId)->first();
        $this->assertSame('approx', json_decode($row->start_meta, true)['qualifier']);
        $this->assertSame('between', json_decode($row->end_meta, true)['qualifier']);
        $this->assertSame('15000101000000', $row->start);
        $this->assertSame('16000101000000', $row->end);
    }

    /**
     * Flexible dates: invalid start_meta.qualifier is rejected.
     */
    public function testFlexibleDateMetaValidation(): void
    {
        $user = $this->createTestUser()->getUser();
        $user->thing_id = $this->createUserThing($user);
        $user->save();
        Sanctum::actingAs($user, ['*']);

        $uniqueId = uuid_create();
        $requestData = $this->getDefaultObjectData([
            'thing_id'   => $uniqueId,
            'start_meta' => ['qualifier' => 'bogus'],
        ]);
        try {
            $json = $this->postApi('/api/v1/object/' . $uniqueId, $requestData, 422);
            $this->assertArrayHasKey('errors', $json, 'Validation should fail for an invalid start_meta.qualifier');
            $this->assertArrayHasKey('start_meta.qualifier', $json['errors']);
        } catch (AssertionFailedError $e) {
            $this->fail('Expected 422 for invalid start_meta.qualifier: ' . $e->getMessage());
        }
    }

    /**
     * Flexible dates: BC (negative) start dates are accepted.
     */
    public function testBcStartDateAccepted(): void
    {
        $user = $this->createTestUser()->getUser();
        $user->thing_id = $this->createUserThing($user);
        $user->save();
        Sanctum::actingAs($user, ['*']);

        $uniqueId = uuid_create();
        $requestData = $this->getDefaultObjectData([
            'thing_id' => $uniqueId,
            'start'    => '-15000101235959', // 1500 BC
            'end'      => '15000101000000',
        ]);
        $json = $this->postApi('/api/v1/object/' . $uniqueId, $requestData);
        $this->assertArrayHasKey('thing_id', $json['data']);

        $row = DB::table('things')->where('thing_id', $uniqueId)->first();
        $this->assertSame('-15000101235959', $row->start);
    }

    /**
     * Raw unpadded date values sent to the API are normalized to canonical
     * form on save, so legacy-style digit strings never re-enter the database.
     */
    public function testStoreNormalizesUnpaddedDates(): void
    {
        $user = $this->createTestUser()->getUser();
        $user->thing_id = $this->createUserThing($user);
        $user->save();
        Sanctum::actingAs($user, ['*']);

        $uniqueId = uuid_create();
        $requestData = $this->getDefaultObjectData([
            'thing_id' => $uniqueId,
            'start'    => '20200101', // raw day-precision
            'end'      => '20200102',
        ]);
        $json = $this->postApi('/api/v1/object/' . $uniqueId, $requestData);
        $this->assertArrayHasKey('thing_id', $json['data']);

        $row = DB::table('things')->where('thing_id', $uniqueId)->first();
        $this->assertSame('20200101000000', $row->start);
        $this->assertSame('20200102000000', $row->end);

        // Canonical values pass through untouched.
        $canonicalId = uuid_create();
        $requestData2 = $this->getDefaultObjectData([
            'thing_id' => $canonicalId,
            'start'    => '20260811120000',
        ]);
        $this->postApi('/api/v1/object/' . $canonicalId, $requestData2);
        $row2 = DB::table('things')->where('thing_id', $canonicalId)->first();
        $this->assertSame('20260811120000', $row2->start);
    }

    /**
     * Search defaults to sorting by start date DESC, with undated objects last
     * (Postgres puts NULLs first on DESC without an explicit NULLS LAST).
     */
    public function testSearchDefaultsToStartDateDescending(): void
    {
        $user = $this->createTestUser()->getUser();
        Sanctum::actingAs($user, ['*']);

        // ApiTest shares one persistent DB across runs, so use a unique per-run
        // suffix to avoid matching leftover objects from earlier test runs.
        $suffix = substr(uuid_create(), 0, 8);
        $names = [
            'older'   => "Sort Older $suffix",
            'middle'  => "Sort Middle $suffix",
            'newer'   => "Sort Newer $suffix",
            'undated' => "Sort Undated $suffix",
        ];
        $this->createTestObject($user, ['name' => $names['older'], 'start' => '20200101']);
        $this->createTestObject($user, ['name' => $names['newer'], 'start' => '20220101']);
        $this->createTestObject($user, ['name' => $names['middle'], 'start' => '20210101']);
        $this->createTestObject($user, ['name' => $names['undated'], 'start' => null, 'end' => null]);

        // Scope the search to this run's own objects (unique suffix) so the
        // persistent shared DB and the 100-result limit don't hide them.
        $res = $this->postJson('/api/v1/object', ['search' => $suffix]);
        $res->assertStatus(200);

        $ours = collect($res->json('things'))
            ->whereIn('name', array_values($names))
            ->pluck('name')
            ->values()
            ->all();
        $this->assertSame([$names['newer'], $names['middle'], $names['older'], $names['undated']], $ours);
    }

    /**
     * Link descriptions: the detail endpoint exposes BOTH endpoint names for
     * every link (`one_name` = one_thing_id's name, `name` = other_thing_id's
     * name) regardless of direction, so the frontend can render incoming and
     * outgoing links alike (previously an incoming link lost the one endpoint
     * and rendered "Unknown").
     */
    public function testObjectDetailLinksExposeBothEndpointNames(): void
    {
        $user = $this->createTestUser()->getUser();
        Sanctum::actingAs($user, ['*']);

        $holder = $this->createTestObject($user, ['name' => 'Detail Link Holder']);
        $target = $this->createTestObject($user, ['name' => 'Detail Link Target']);

        // holder → target: from the target's perspective this is an INCOMING
        // link, the case that previously dropped the one-endpoint name.
        $this->putApi('/api/v1/object/' . $holder, array_merge(
            $this->getFullObjectDataForUpdate($holder),
            ['links_to_add' => [['link_type_id' => UUID::LINK_TO_CLASS, 'other_thing_id' => $target]]],
        ));

        $json = $this->getApi('/api/v1/object/' . $target);
        $links = $json['data']['links'] ?? [];
        $incoming = collect($links)->firstWhere('one_thing_id', $holder);
        $this->assertNotNull($incoming, 'target should have an incoming link from the holder');
        $this->assertSame('Detail Link Holder', $incoming['one_name']);
        $this->assertSame('Detail Link Target', $incoming['name']);
    }
}
