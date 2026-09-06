<?php

namespace Tests\Feature;

use App\Services\MediaLink\UrlMediaClassifier;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use Tests\Traits\CreatesTestUsers;
use Tests\Traits\SafeRefreshDatabase;

class MediaFromUrlTest extends TestCase
{
    use SafeRefreshDatabase;
    use CreatesTestUsers;

    private function actingThingId(): string
    {
        $user = $this->createTestUser()->getUser();
        Sanctum::actingAs($user, ['*']);
        return (string) $user->thing_id;
    }

    /** @test */
    public function classifies_urls_into_media_classes()
    {
        $video = UrlMediaClassifier::classify('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        $this->assertSame(UUID::VIDEO, $video['class']);
        $this->assertSame('video', $video['kind']);

        $vk = UrlMediaClassifier::classify('https://vk.com/video-123_456');
        $this->assertSame(UUID::VIDEO, $vk['class']);

        $vkvideo = UrlMediaClassifier::classify('https://vkvideo.ru/video-235459_456242474?list=19b0632464f38e05d5');
        $this->assertSame(UUID::VIDEO, $vkvideo['class']);

        $image = UrlMediaClassifier::classify('https://example.com/photo.JPG');
        $this->assertSame(UUID::PHOTO, $image['class']);

        $audio = UrlMediaClassifier::classify('https://example.com/voice.mp3');
        $this->assertSame(UUID::AUDIO, $audio['class']);

        $this->assertNull(UrlMediaClassifier::classify('https://example.com/some-page'));
        $this->assertNull(UrlMediaClassifier::classify('not a url'));
    }

    /** @test */
    public function looks_like_url_detects_bare_domains()
    {
        $this->assertTrue(UrlMediaClassifier::looksLikeUrl('www.booksite.ru'));
        $this->assertTrue(UrlMediaClassifier::looksLikeUrl('http://example.org/book'));
        $this->assertFalse(UrlMediaClassifier::looksLikeUrl('Указатель «Возвращенные имена»'));
    }

    /** @test */
    public function creates_a_video_media_object_from_a_youtube_url()
    {
        $parentId = $this->actingThingId();
        $url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

        $response = $this->postJson("/api/v1/object/{$parentId}/media-from-url", ['url' => $url])
            ->assertOk()
            ->assertJsonPath('success', true);

        $mediaId = $response->json('media.thing_id');
        $this->assertNotNull($mediaId);

        $this->assertDatabaseHas('things', ['thing_id' => $mediaId]);
        $response->assertJsonPath('media.class_id', UUID::VIDEO);
        $this->assertSame($url, $response->json('media.url'));

        // The media object is classed as Video.
        $this->assertDatabaseHas('links', [
            'one_thing_id'   => $mediaId,
            'link_type_id'   => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::VIDEO,
        ]);

        // The URL lives as an external link ON the media object.
        $this->assertDatabaseHas('external_links', ['thing_id' => $mediaId, 'url' => $url]);

        // … and NOT on the original object.
        $this->assertDatabaseMissing('external_links', ['thing_id' => $parentId, 'url' => $url]);

        // The original object is linked to the media object ("has media depicting").
        $this->assertDatabaseHas('links', [
            'one_thing_id'   => $parentId,
            'link_type_id'   => UUID::MEDIA_DEPICTS,
            'other_thing_id' => $mediaId,
        ]);

        // Owner/public mirror the acting user / source object.
        $media = DB::table('things')->where('thing_id', $mediaId)->first();
        $parent = DB::table('things')->where('thing_id', $parentId)->first();
        $this->assertSame((string) $parent->owner, (string) $media->owner);

        // The media object must be openable: a URL-only media Thing has no
        // photo_media file row, so its class dispatch must still resolve.
        $this->getJson("/api/v1/object/{$mediaId}")
            ->assertOk()
            ->assertJsonPath('data.thing_id', $mediaId)
            ->assertJsonPath('data.class.name', 'Video');
    }

    /** @test */
    public function creates_an_image_media_object_from_an_image_url()
    {
        $parentId = $this->actingThingId();
        $url = 'https://example.com/pic.JPG';

        $this->postJson("/api/v1/object/{$parentId}/media-from-url", ['url' => $url])
            ->assertOk()
            ->assertJsonPath('media.class_id', UUID::PHOTO);
    }

    /** @test */
    public function rejects_urls_that_do_not_look_like_media()
    {
        $parentId = $this->actingThingId();

        $this->postJson("/api/v1/object/{$parentId}/media-from-url", ['url' => 'https://example.com/some-page'])
            ->assertStatus(422);
    }

    /** @test */
    public function manual_class_override_promotes_any_url()
    {
        $parentId = $this->actingThingId();
        $url = 'https://example.com/some-page';

        $this->postJson("/api/v1/object/{$parentId}/media-from-url", [
            'url'   => $url,
            'class' => 'article',
            'name'  => 'Лодка викингов — статья',
        ])
            ->assertOk()
            ->assertJsonPath('media.class_id', UUID::ARTICLE_CLASS)
            ->assertJsonPath('media.name', 'Лодка викингов — статья');

        $mediaId = DB::table('external_links')->where('url', $url)->value('thing_id');
        $this->assertNotNull($mediaId);
        $this->assertDatabaseHas('links', [
            'one_thing_id'   => $mediaId,
            'link_type_id'   => UUID::LINK_TO_CLASS,
            'other_thing_id' => UUID::ARTICLE_CLASS,
        ]);
    }

    /** @test */
    public function non_owner_cannot_create_media_for_someone_elses_object()
    {
        $owner = $this->createTestUser()->getUser();
        $parentId = (string) $owner->thing_id;

        // A different user tries to attach media to the first user's object.
        $other = $this->createTestUser()->getUser();
        Sanctum::actingAs($other, ['*']);

        $this->postJson("/api/v1/object/{$parentId}/media-from-url", [
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        ])->assertForbidden();
    }
}
