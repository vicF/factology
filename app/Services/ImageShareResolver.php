<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Resolves "share page" links from cloud photo/file hosts into the direct URL
 * of the underlying image bytes.
 *
 * Importing an image by URL is a plain GET plus a Content-Type check. Some
 * hosts (Yandex Disk, …) serve their public links as an HTML viewer page
 * rather than the raw file, so a plain GET never returns image bytes. This
 * class asks those hosts for the real download URL before the caller fetches.
 *
 * resolveImageUrl() returns null when no rewrite applies — the caller should
 * just GET the pasted URL as-is.
 */
class ImageShareResolver
{
    /** Yandex Disk public API: turns a share URL into a direct download href. */
    private const YANDEX_API = 'https://cloud-api.yandex.net/v1/disk/public/resources/download';

    /**
     * Return the URL whose bytes hold the image behind $url.
     *
     * @param string $url user-pasted http(s) link
     * @return string|null direct download URL, or null to fetch $url unchanged
     */
    public static function resolveImageUrl(string $url): ?string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        // Yandex Disk public links: https://disk.yandex.ru/i/<id> (image viewer)
        // and https://disk.yandex.ru/d/<id> (shared file), plus yadi.sk shorts.
        $isYandexDisk = $host === 'yadi.sk'
            || (preg_match('#^disk\.yandex\.[a-z]{2,3}(?:\.[a-z]{2})?$#', $host) === 1
                && preg_match('#^/(?:i|d)/#', (string) parse_url($url, PHP_URL_PATH)) === 1);

        return $isYandexDisk ? static::yandexDiskDirectUrl($url) : null;
    }

    /**
     * Ask the Yandex public-resources API for the direct download href of a
     * share URL. Returns null when the resource cannot be resolved (removed,
     * not yet public, API unreachable, …).
     */
    protected static function yandexDiskDirectUrl(string $url): ?string
    {
        try {
            $response = Http::timeout(10)->get(static::YANDEX_API, [
                'public_key' => $url,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Yandex Disk share resolution threw', ['url' => $url, 'error' => $e->getMessage()]);
            return null;
        }

        if ($response->failed()) {
            Log::info('Yandex Disk share resolution failed', ['url' => $url, 'status' => $response->status()]);
            return null;
        }

        $href = $response->json('href');
        return is_string($href) && $href !== '' ? $href : null;
    }
}
