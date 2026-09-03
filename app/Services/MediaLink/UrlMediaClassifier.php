<?php

namespace App\Services\MediaLink;

use Fokin\Facts\Data\UUID;

/**
 * Classifies an external URL into the media class (Video/Image/Audio) it
 * represents, so a pasted link can be promoted into a media object.
 *
 * Classification is heuristic (video hosts + file extensions) and deliberately
 * conservative: anything ambiguous returns null and the UI simply hides the
 * "create object" option.
 */
class UrlMediaClassifier
{
    /** Video-hosting domains (exact host match after stripping www.). */
    private const HOST_VIDEO = [
        'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'vkvideo.ru',
    ];

    /** Image file extensions. */
    private const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'];

    /** Audio file extensions. */
    private const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'flac'];

    /**
     * @return array{class: string, kind: string, label: array{en: string, ru: string}, provider: string}|null
     *         null when the URL is not recognisably a video/image/audio link.
     */
    public static function classify(?string $url): ?array
    {
        if ($url === null || trim($url) === '') {
            return null;
        }
        $host = self::host($url);
        if ($host === null) {
            return null;
        }
        $path = (string) parse_url($url, PHP_URL_PATH);

        if (in_array($host, self::HOST_VIDEO, true)) {
            return self::result(UUID::VIDEO, 'video', 'Video', 'Видео', $host);
        }
        if ($host === 'vk.com' && preg_match('#/(?:video|clip)#i', $path)) {
            return self::result(UUID::VIDEO, 'video', 'Video', 'Видео', $host);
        }

        $ext = strtolower((string) pathinfo($path, PATHINFO_EXTENSION));
        if ($ext !== '' && in_array($ext, self::IMAGE_EXT, true)) {
            return self::result(UUID::PHOTO, 'image', 'Image', 'Изображение', $host);
        }
        if ($ext !== '' && in_array($ext, self::AUDIO_EXT, true)) {
            return self::result(UUID::AUDIO, 'audio', 'Audio', 'Аудио', $host);
        }

        return null;
    }

    /**
     * Whether a free-text string looks like a web URL/domain. Used to detect
     * GEDCOM source titles that are really URLs (and must not become objects).
     */
    public static function looksLikeUrl(?string $value): bool
    {
        if ($value === null || trim($value) === '') {
            return false;
        }
        $value = trim($value);
        return (bool) preg_match('#^https?://#i', $value)
            || (bool) preg_match('#^www\.[a-z0-9.-]+#i', $value);
    }

    private static function host(string $url): ?string
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (!is_string($host) || $host === '') {
            return null;
        }
        return preg_replace('/^www\./', '', strtolower($host));
    }

    private static function result(string $class, string $kind, string $labelEn, string $labelRu, string $provider): array
    {
        return [
            'class'    => $class,
            'kind'     => $kind,
            'label'    => ['en' => $labelEn, 'ru' => $labelRu],
            'provider' => $provider,
        ];
    }
}
