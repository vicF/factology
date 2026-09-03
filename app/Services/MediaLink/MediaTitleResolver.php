<?php

namespace App\Services\MediaLink;

use GuzzleHttp\Client;
use Throwable;

/**
 * Best-effort resolver for the real title of an external media URL.
 *
 * Order: oEmbed (YouTube/Vimeo) → OpenGraph og:title → <title>. Anything that
 * fails (network sandbox, DNS, timeout, 403) simply returns null and the caller
 * falls back to a placeholder name. This class never throws and must never be
 * called inside a long-running DB transaction — resolve titles first.
 */
class MediaTitleResolver
{
    private Client $client;

    public function __construct(?Client $client = null)
    {
        $this->client = $client ?? new Client([
            'timeout'         => 5,
            'connect_timeout' => 3,
            'http_errors'     => false,
            'verify'          => true,
            'headers'         => ['User-Agent' => 'Mozilla/5.0 (compatible; factology-media-title)'],
        ]);
    }

    public function resolve(string $url): ?string
    {
        try {
            return $this->oEmbedTitle($url) ?? $this->ogTitle($url);
        } catch (Throwable $e) {
            return null;
        }
    }

    private function oEmbedTitle(string $url): ?string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        if (str_contains($host, 'youtube.com') || str_contains($host, 'youtu.be')) {
            $endpoint = 'https://www.youtube.com/oembed?format=json&url=' . rawurlencode($url);
        } elseif (str_contains($host, 'vimeo.com')) {
            $endpoint = 'https://vimeo.com/api/oembed.json?url=' . rawurlencode($url);
        } else {
            return null;
        }

        $response = $this->client->get($endpoint);
        if ($response->getStatusCode() !== 200) {
            return null;
        }
        $json = json_decode((string) $response->getBody(), true);
        $title = $json['title'] ?? null;
        return is_string($title) && trim($title) !== '' ? trim($title) : null;
    }

    private function ogTitle(string $url): ?string
    {
        $response = $this->client->get($url);
        if ($response->getStatusCode() !== 200) {
            return null;
        }
        $html = (string) $response->getBody();

        if (preg_match('/<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']/i', $html, $m)
            || preg_match('/<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:title["\']/i', $html, $m)) {
            return $this->decode($m[1]);
        }
        if (preg_match('/<title[^>]*>(.*?)<\/title>/is', $html, $m)) {
            return $this->decode($m[1]);
        }
        return null;
    }

    private function decode(string $value): string
    {
        return html_entity_decode(trim($value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
}
