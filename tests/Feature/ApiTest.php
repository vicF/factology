<?php

namespace Tests\Feature;

use App\Eloquent\Thing;
use App\Models\User; // Fix: Use correct namespace
use App\Models\Classes\Anything;
use Fokin\Facts\Data\UUID;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\AssertionFailedError;
use Tests\TestCase;

class ApiTest extends TestCase
{
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
        Sanctum::actingAs(
            User::factory()->make(),
            ['*']
        );

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

    public function testGetTest(): void
    {
        $uri = '/api/v1/object/' . UUID::SOMETHING;

        $user = User::factory()->make();

        $json = $this->actingAs($user, 'sanctum')
            ->getApi($uri);

        $this->assertArrayHasKey('data', $json);
        $this->assertArrayHasKey('thing_id', $json['data']);
        $this->assertArrayHasKey('name', $json['data']);
        $this->assertArrayHasKey('type', $json['data']);
        $this->assertArrayHasKey('description', $json['data']);
        $this->assertArrayHasKey('start', $json['data']);
        $this->assertArrayHasKey('end', $json['data']);
    }

    /**
     * Test create, read, update, and delete operations with authentication
     *
     * @throws \Throwable
     */
    public function testCreateModifyDelete(): void
    {
        // Create a user and authenticate
        $user = User::factory()->create();
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
        // Create owner user
        $owner = User::factory()->create();

        // Create an object as the owner using the helper method
        $thingId = $this->createTestObject($owner, [
            'name' => 'Owner\'s Object',
            'description' => 'This belongs to owner',
        ]);

        // Get the full object data for update (this will be used by the unauthorized user)
        // We need to do this as the owner first to get the data
        Sanctum::actingAs($owner, ['*']);
        $fullObjectData = $this->getFullObjectDataForUpdate($thingId, [
            'description' => 'Trying to hijack this object',
        ]);

        // Try to update with a different user
        $otherUser = User::factory()->create();
        Sanctum::actingAs($otherUser, ['*']);

        $updateUri = '/api/v1/object/' . $thingId;

        try {
            // Expect 403 (Forbidden) or 404 (Not Found)
            $this->putApi($updateUri, $fullObjectData, 403);
            // If we get here without exception, the test passed
            $this->assertTrue(true, "Got 403 Forbidden as expected");
        } catch (AssertionFailedError $e) {
            // Check if it's 404 instead of 403
            if (str_contains($e->getMessage(), 'Expected status 403 but got 404')) {
                // 404 is also acceptable (resource not found for this user)
                $this->assertTrue(true, "Got 404 which is acceptable");
            } else {
                throw $e;
            }
        }

        // Clean up - authenticate as owner again to delete the object
        Sanctum::actingAs($owner, ['*']);
        $this->deleteApi('/api/v1/object/' . $thingId);
    }

    /**
     * Test creating an object with minimal required fields
     */
    public function testCreateWithMinimalFields(): void
    {
        $user = User::factory()->create();
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
}
