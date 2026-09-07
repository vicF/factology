<?php

namespace Tests\Unit;

use App\Services\ImageShareResolver;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ImageShareResolverTest extends TestCase
{
    public function test_plain_image_url_is_left_unchanged(): void
    {
        Http::fake(); // no outbound call may be attempted for a non-share URL

        $this->assertNull(ImageShareResolver::resolveImageUrl('https://example.com/pic.png'));
        $this->assertNull(ImageShareResolver::resolveImageUrl('https://example.com/pic?x=1'));
    }

    public function test_yandex_non_share_page_is_left_unchanged(): void
    {
        Http::fake(); // only /i/ and /d/ share paths trigger the API

        $this->assertNull(ImageShareResolver::resolveImageUrl('https://disk.yandex.ru/client/disk'));
    }

    public function test_yandex_disk_share_link_resolves_to_download_href(): void
    {
        Http::fake([
            'cloud-api.yandex.net/*' => Http::response([
                'href' => 'https://downloader.disk.yandex.ru/disk/final.jpg',
            ]),
        ]);

        $resolved = ImageShareResolver::resolveImageUrl('https://disk.yandex.ru/i/kGiFB1RmcmtEGg');

        $this->assertSame('https://downloader.disk.yandex.ru/disk/final.jpg', $resolved);
    }

    public function test_yandex_disk_short_and_localized_links_resolve(): void
    {
        Http::fake([
            'cloud-api.yandex.net/*' => Http::response(['href' => 'https://downloader.disk.yandex.ru/disk/a.jpg']),
        ]);

        $this->assertNotNull(ImageShareResolver::resolveImageUrl('https://yadi.sk/i/AbCd'));
        $this->assertNotNull(ImageShareResolver::resolveImageUrl('https://disk.yandex.ru/d/SomeFile'));
        $this->assertNotNull(ImageShareResolver::resolveImageUrl('https://disk.yandex.com.tr/d/SomeFile'));
    }

    public function test_yandex_disk_failed_resolution_returns_null(): void
    {
        Http::fake([
            'cloud-api.yandex.net/*' => Http::response(['message' => 'Not found'], 404),
        ]);

        $this->assertNull(ImageShareResolver::resolveImageUrl('https://disk.yandex.ru/d/removed-file'));
    }

    public function test_yandex_disk_empty_href_returns_null(): void
    {
        Http::fake([
            'cloud-api.yandex.net/*' => Http::response(['message' => 'ok']),
        ]);

        $this->assertNull(ImageShareResolver::resolveImageUrl('https://disk.yandex.ru/d/no-href'));
    }
}
