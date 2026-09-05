<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ThumbStore;
use Fokin\Facts\Data\UUID;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

class ObjectThumbTest extends TestCase
{
    use SafeRefreshDatabase,
        CreatesTestUsers;

    protected string $thumbsBase;

    protected function setUp(): void
    {
        parent::setUp();
        // Write thumbs to a temp area — never into the real shared folder.
        $this->thumbsBase = storage_path('framework/testing/thumbs');
        config(['app.thumbs_base' => $this->thumbsBase]);
    }

    protected function tearDown(): void
    {
        if (is_dir($this->thumbsBase)) {
            exec('rm -rf ' . escapeshellarg($this->thumbsBase));
        }
        parent::tearDown();
    }

    /** Create an owned object row directly (thumb routes don't care about type). */
    protected function insertThing(string $thingId, string $owner): void
    {
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
        DB::table('things')->insert([
            'thing_id'    => $thingId,
            'name'        => 'Thumb Test Object ' . $thingId,
            'description' => 'created for thumb tests',
            'type'        => UUID::GENERAL,
            'owner'       => $owner,
            'public'      => false,
            'server_uuid' => $serverUuid,
        ]);
    }

    /** Create a user (with a things row + thing_id) and an object they own. */
    protected function makeUserAndObject(): array
    {
        $user = $this->createTestUser()->getUser();
        if (!$user->thing_id) {
            $userThing = uuid_create();
            $this->insertThing($userThing, $userThing);
            $user->thing_id = $userThing;
            $user->save();
        }
        $thingId = uuid_create();
        $this->insertThing($thingId, $user->thing_id);
        return [$user, $thingId];
    }

    protected function makeImage(int $w = 200, int $h = 100): string
    {
        $im = imagecreatetruecolor($w, $h);
        $color = imagecolorallocate($im, 200, 50, 50);
        imagefilledrectangle($im, 0, 0, $w - 1, $h - 1, $color);
        $path = tempnam(sys_get_temp_dir(), 'png_') . '.png';
        imagepng($im, $path);
        imagedestroy($im);
        return $path;
    }

    public function test_upload_small_variant_writes_small_thumb(): void
    {
        [$user, $thingId] = $this->makeUserAndObject();
        $image = new UploadedFile($this->makeImage(800, 400), 'photo.png', 'image/png', null, true);

        $response = $this->actingAs($user)->call(
            'POST', "/api/v1/object/{$thingId}/thumb", [], [], ['file' => $image], ['CONTENT_TYPE' => 'multipart/form-data']
        );

        $response->assertOk();
        $json = $response->json();
        $this->assertTrue($json['success']);
        $this->assertSame('small', $json['size']);
        $this->assertFileExists(ThumbStore::localPath($thingId));
        [$width] = getimagesize(ThumbStore::localPath($thingId));
        $this->assertLessThanOrEqual(100, $width);
    }

    public function test_medium_and_original_variants_respect_profile(): void
    {
        [$user, $thingId] = $this->makeUserAndObject();
        $image = new UploadedFile($this->makeImage(800, 400), 'photo.png', 'image/png', null, true);

        $medium = $this->actingAs($user)->call(
            'POST', "/api/v1/object/{$thingId}/thumb?size=medium", [], [], ['file' => $image], ['CONTENT_TYPE' => 'multipart/form-data']
        )->json();
        $this->assertTrue($medium['success']);
        [$w] = getimagesize(ThumbStore::localPath($thingId));
        $this->assertLessThanOrEqual(512, $w);

        $original = $this->actingAs($user)->call(
            'POST', "/api/v1/object/{$thingId}/thumb?size=original", [], [], ['file' => $image], ['CONTENT_TYPE' => 'multipart/form-data']
        )->json();
        $this->assertTrue($original['success']);
        [$w2] = getimagesize(ThumbStore::localPath($thingId));
        $this->assertSame(800, $w2);
    }

    public function test_url_import_downloads_and_encodes(): void
    {
        [$user, $thingId] = $this->makeUserAndObject();
        Http::fake([
            'https://example.com/*' => Http::response(file_get_contents($this->makeImage(300, 150)), 200, ['Content-Type' => 'image/png']),
        ]);

        $response = $this->actingAs($user)->postJson("/api/v1/object/{$thingId}/thumb", [
            'url' => 'https://example.com/pic.png',
        ]);

        $response->assertOk();
        $this->assertTrue($response->json('success'));
        $this->assertFileExists(ThumbStore::localPath($thingId));
        [$width] = getimagesize(ThumbStore::localPath($thingId));
        $this->assertLessThanOrEqual(100, $width);
    }

    public function test_url_import_rejects_non_image_content_type(): void
    {
        [$user, $thingId] = $this->makeUserAndObject();
        Http::fake([
            'https://example.com/*' => Http::response('<html>oops</html>', 200, ['Content-Type' => 'text/html']),
        ]);

        $response = $this->actingAs($user)->postJson("/api/v1/object/{$thingId}/thumb", [
            'url' => 'https://example.com/notimage.html',
        ]);

        $response->assertStatus(422);
        $this->assertFileDoesNotExist(ThumbStore::localPath($thingId));
    }

    public function test_remove_thumb_deletes_file_and_returns_success(): void
    {
        [$user, $thingId] = $this->makeUserAndObject();
        $image = new UploadedFile($this->makeImage(50, 50), 'photo.png', 'image/png', null, true);
        $this->actingAs($user)->call(
            'POST', "/api/v1/object/{$thingId}/thumb", [], [], ['file' => $image], ['CONTENT_TYPE' => 'multipart/form-data']
        )->assertOk();
        $this->assertFileExists(ThumbStore::localPath($thingId));

        $response = $this->actingAs($user)->deleteJson("/api/v1/object/{$thingId}/thumb");
        $response->assertOk();
        $this->assertTrue($response->json('success'));
        $this->assertTrue($response->json('had_thumb'));
        $this->assertFileDoesNotExist(ThumbStore::localPath($thingId));
    }

    public function test_remove_without_custom_thumb_reports_had_thumb_false(): void
    {
        [$user, $thingId] = $this->makeUserAndObject();
        $response = $this->actingAs($user)->deleteJson("/api/v1/object/{$thingId}/thumb");
        $response->assertOk();
        $this->assertFalse($response->json('had_thumb'));
    }

    public function test_other_user_cannot_change_image(): void
    {
        [$user, $thingId] = $this->makeUserAndObject();
        $stranger = $this->createTestUser()->getUser();
        if (!$stranger->thing_id) {
            $strangerThing = uuid_create();
            $this->insertThing($strangerThing, $strangerThing);
            $stranger->thing_id = $strangerThing;
            $stranger->save();
        }

        $response = $this->actingAs($stranger)->postJson("/api/v1/object/{$thingId}/thumb", [
            'url' => 'https://example.com/x.png',
        ]);

        $response->assertStatus(403);
    }
}
