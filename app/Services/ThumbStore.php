<?php

namespace App\Services;

use App\Models\Classes\Everything;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Writes and removes the per-object image/icon file (a JPEG named by the
 * object's UUID, under {thumbs_base}/{uuid[0]}/{uuid[1]}/{uuid}.jpg).
 *
 * Replaces the old (no longer installed) claviska\SimpleImage pipeline with a
 * self-contained GD encoder. Variants let callers trade server storage for
 * fidelity:
 *   - small    (default) — 100px JPEG q20, identical profile to the historic
 *              object icons (~1–2 KB) so server storage stays tiny;
 *   - medium   — 512px JPEG q80;
 *   - original — full dimensions, re-encoded JPEG q85.
 *
 * When an object has no custom image the web UI falls back to the icon of its
 * class (a symlink in the thumbs tree). remove() restores that fallback.
 */
class ThumbStore
{
    /** Size profiles: max edge (px) → JPEG quality. null max = keep dimensions. */
    public const VARIANTS = [
        'small'    => ['max' => 100, 'quality' => 20],
        'medium'   => ['max' => 512, 'quality' => 80],
        'original' => ['max' => null, 'quality' => 85],
    ];

    /** Guard against decompression bombs / absurd pixel counts. */
    public const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
    public const MAX_SOURCE_DIMENSION = 12000;

    /**
     * Root directory that holds the {a}/{b}/{uuid}.jpg tree. Defaults to the
     * historic location (public/thumbs). Tests override it via the
     * `app.thumbs_base` config so they never write into the real folder.
     */
    protected static function basePath(): string
    {
        return rtrim((string) config('app.thumbs_base', public_path('thumbs')), '/\\');
    }

    /** Local filesystem path for a thing's thumb file. */
    public static function localPath(string $thingId): string
    {
        return static::basePath() . DIRECTORY_SEPARATOR
            . $thingId[0] . DIRECTORY_SEPARATOR . $thingId[1] . DIRECTORY_SEPARATOR . $thingId . '.jpg';
    }

    /** Web path served by the static server (mirrors Everything::getThumbWebPath). */
    public static function webPath(string $thingId): string
    {
        return '/thumbs/' . $thingId[0] . '/' . $thingId[1] . '/' . $thingId . '.jpg';
    }

    public static function isValidSize(string $size): bool
    {
        return isset(static::VARIANTS[$size]);
    }

    /**
     * Encode $sourceFile into the optimized thumb for $thingId.
     *
     * @param string $thingId     target object UUID
     * @param string $sourceFile  path to a readable image file (jpeg/png/gif/webp/bmp)
     * @param string $size        small|medium|original
     * @return array{thing_id:string,size:string,thumb:string,bytes:int}
     * @throws RuntimeException when the source is not a decodable image
     */
    public static function put(string $thingId, string $sourceFile, string $size = 'small'): array
    {
        if (!static::isValidSize($size)) {
            throw new RuntimeException('Unsupported thumb size "' . $size . '".');
        }
        if (!is_file($sourceFile)) {
            throw new RuntimeException('Image source file is missing.');
        }
        $bytes = filesize($sourceFile);
        if ($bytes === false || $bytes > static::MAX_SOURCE_BYTES) {
            throw new RuntimeException('Image file is too large.');
        }

        $image = @imagecreatefromstring((string) file_get_contents($sourceFile));
        if ($image === false) {
            throw new RuntimeException('The uploaded file is not a readable image.');
        }

        $sourceW = imagesx($image);
        $sourceH = imagesy($image);
        if ($sourceW > static::MAX_SOURCE_DIMENSION || $sourceH > static::MAX_SOURCE_DIMENSION) {
            imagedestroy($image);
            throw new RuntimeException('Image dimensions are too large.');
        }

        // JPEG/TIFF source photos straight from a camera may carry an EXIF
        // orientation flag that viewers apply at render time — bake it in.
        $exif = @exif_read_data($sourceFile);
        if (is_array($exif) && !empty($exif['Orientation'])) {
            $image = static::applyOrientation($image, (int) $exif['Orientation']);
            $sourceW = imagesx($image);
            $sourceH = imagesy($image);
        }

        $profile = static::VARIANTS[$size];
        [$dstW, $dstH] = $profile['max'] === null
            ? [$sourceW, $sourceH]
            : static::fitWithin($sourceW, $sourceH, $profile['max']);

        $canvas = imagecreatetruecolor(max(1, $dstW), max(1, $dstH));
        // JPEG has no alpha — flatten any transparency onto white.
        $white = imagecolorallocate($canvas, 255, 255, 255);
        imagefilledrectangle($canvas, 0, 0, max(1, $dstW), max(1, $dstH), $white);
        imagecopyresampled($canvas, $image, 0, 0, 0, 0, $dstW, $dstH, $sourceW, $sourceH);

        $target = static::localPath($thingId);
        @mkdir(dirname($target), 0775, true);
        @unlink($target); // remove any real file or class-icon symlink before writing

        if (!imagejpeg($canvas, $target, $profile['quality'])) {
            imagedestroy($image);
            imagedestroy($canvas);
            throw new RuntimeException('Failed to write the image file.');
        }
        imagedestroy($image);
        imagedestroy($canvas);

        return [
            'thing_id' => $thingId,
            'size'     => $size,
            'thumb'    => static::webPath($thingId),
            'bytes'    => (int) filesize($target),
        ];
    }

    /**
     * Remove the object's custom thumb file, then restore the icon fallback
     * (class icon first, then first LINK_TO_PARENT icon) so URLs keep working.
     *
     * @return bool whether a custom thumb file existed
     */
    public static function remove(string $thingId): bool
    {
        $target = static::localPath($thingId);
        $existed = false;
        if (is_file($target) || is_link($target)) {
            $existed = true;
            @unlink($target);
        }
        static::restoreFallback($thingId);
        return $existed;
    }

    /**
     * If the object has no own image yet, symlink the thumb of its class (or a
     * LINK_TO_PARENT endpoint) into its own slot — mirrors the historic icon
     * inheritance so every object's thumb URL resolves.
     */
    public static function restoreFallback(string $thingId): void
    {
        $target = static::localPath($thingId);
        if (is_file($target) && !is_link($target)) {
            return; // a real custom image already exists
        }

        $candidates = collect(DB::table('links')
            ->where('one_thing_id', $thingId)
            ->where('link_type_id', UUID::LINK_TO_CLASS)
            ->pluck('other_thing_id'))
            ->merge(DB::table('links')
                ->where('one_thing_id', $thingId)
                ->where('link_type_id', UUID::LINK_TO_PARENT)
                ->pluck('other_thing_id'));

        foreach ($candidates as $otherId) {
            if (!$otherId) {
                continue;
            }
            $otherPath = static::localPath($otherId);
            if (is_file($otherPath) || is_link($otherPath)) {
                @unlink($target);
                @mkdir(dirname($target), 0775, true);
                @symlink($otherPath, $target);
                return;
            }
        }
    }

    /** Aspect-fit an image inside a square of $max pixels. */
    protected static function fitWithin(int $w, int $h, int $max): array
    {
        if ($w <= $max && $h <= $max) {
            return [$w, $h];
        }
        $ratio = min($max / $w, $max / $h);
        return [(int) max(1, round($w * $ratio)), (int) max(1, round($h * $ratio))];
    }

    /** Rotate/flip a GD image per EXIF orientation tag (1–8). */
    protected static function applyOrientation($image, int $orientation)
    {
        switch ($orientation) {
            case 2: imageflip($image, IMG_FLIP_HORIZONTAL); break;
            case 3: $image = imagerotate($image, 180, 0); break;
            case 4: imageflip($image, IMG_FLIP_VERTICAL); break;
            case 5: $image = imagerotate($image, 90, 0); imageflip($image, IMG_FLIP_HORIZONTAL); break;
            case 6: $image = imagerotate($image, -90, 0); break;
            case 7: $image = imagerotate($image, 90, 0); imageflip($image, IMG_FLIP_VERTICAL); break;
            case 8: $image = imagerotate($image, 90, 0); break;
        }
        return $image;
    }
}
