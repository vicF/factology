// resources/js/utils/imageEditing.js
//
// Client-side image preparation: decodes a picked image (EXIF-oriented) and
// re-encodes it to the size profile chosen for storage. Profiles mirror the
// server's ThumbStore variants so the uploaded payload is already the right
// size — the server re-encodes anyway as a final gate.
//
//   small    — 100px JPEG (default; ~1–2 KB — server storage friendly)
//   medium   — 512px JPEG
//   original — no re-scale; original bytes are uploaded as-is
//
// When run in a browser/WebView this keeps the heavy resize off the server;
// offline (device folder) it is also the encoder that produces small files.

export const IMAGE_VARIANTS = {
    small: { maxDimension: 100, jpegQuality: 0.6 },
    medium: { maxDimension: 512, jpegQuality: 0.82 },
    original: { maxDimension: null, jpegQuality: 0.9 },
};

export function isValidSize(size) {
    return Object.prototype.hasOwnProperty.call(IMAGE_VARIANTS, size);
}

/** Aspect-fit a rectangle inside a square of $max pixels. */
export function fitWithin(width, height, max) {
    if (!max || (width <= max && height <= max)) return [width, height];
    const ratio = Math.min(max / width, max / height);
    return [Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio))];
}

function decodeViaImage(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
    });
}

/**
 * Decode an image blob to a drawable (ImageBitmap preferred; Chromium applies
 * EXIF orientation automatically; falls back to an <img> element).
 */
export async function decodeImage(blob) {
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(blob, { imageOrientation: 'from-image' });
        } catch (e) {
            // some codecs (svg) may reject createImageBitmap
        }
    }
    return decodeViaImage(blob);
}

function drawableSize(drawable) {
    if (typeof drawable.naturalWidth === 'number') return [drawable.naturalWidth, drawable.naturalHeight];
    if (typeof drawable.width === 'number') return [drawable.width, drawable.height];
    return [1, 1];
}

/**
 * Re-encode a drawable to a JPEG blob sized per profile.
 */
export function drawableToJpegBlob(drawable, size) {
    const profile = IMAGE_VARIANTS[size] || IMAGE_VARIANTS.small;
    const [srcW, srcH] = drawableSize(drawable);
    const [w, h] = fitWithin(srcW, srcH, profile.maxDimension);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // JPEG has no alpha — flatten transparency onto white.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(drawable, 0, 0, w, h);

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Image encoding failed (canvas.toBlob).'));
        }, 'image/jpeg', profile.jpegQuality);
    });
}

/**
 * Prepare a picked File for storage.
 *   small/medium → JPEG re-encoded to the profile (keeps uploads + device
 *                  storage tiny by default)
 *   original     → the original bytes are passed through untouched
 *
 * @returns {Promise<{blob: Blob, kind: 'encoded'|'original'}>}
 */
export async function prepareImageFile(file, size = 'small') {
    if (size === 'original') return { blob: file, kind: 'original' };
    const drawable = await decodeImage(file);
    const blob = await drawableToJpegBlob(drawable, size);
    if (drawable && typeof drawable.close === 'function') drawable.close();
    return { blob, kind: 'encoded' };
}
