// resources/js/utils/objectImages.js
//
// One façade the UI uses to read and set an object's image/icon, hiding where
// the bytes actually live:
//   - web / remote-server build → server (routes/controllers: object thumb)
//   - standalone offline build (no VITE_API_URL) → a folder of image files on
//     the device (see ../media/deviceImages.js)
//
// Thumbnails keep the server's classic layout everywhere:
//   {root}/{uuid[0]}/{uuid[1]}/{uuid}.jpg
// served by the web server as /thumbs/…, by Electron's local static server as
// the same /thumbs/… path, and on native mobile via Capacitor convertFileSrc.

import axios from 'axios';
import { ref } from 'vue';
import { prepareImageFile, IMAGE_VARIANTS } from './imageEditing';

/**
 * Bumped whenever an object's image changes; <Image> components append it as a
 * cache-busting query so the browser re-fetches the same UUID's thumb URL.
 */
export const thumbRevision = ref(0);
export function bumpThumbRevision() {
    thumbRevision.value += 1;
}

/** True when this build has no server at all (images live on the device). */
export function isOfflineOnly() {
    return import.meta.env.VITE_TARGET === 'capacitor' && !import.meta.env.VITE_API_URL;
}

/** Origin of the API server ('' when same-origin web app). */
function serverOrigin() {
    const api = import.meta.env.VITE_API_URL || '';
    if (!api) return '';
    return api.replace(/\/api\/v1\/?$/, '');
}

export function thumbRelPath(uuid) {
    if (!uuid) return '';
    return `/thumbs/${uuid.charAt(0)}/${uuid.charAt(1)}/${uuid}.jpg`;
}

/**
 * Synchronous URL for displaying an object's thumb. In offline native builds a
 * device folder base is resolved during bootstrap (deviceThumbsBase cache); the
 * returned URL 404s → the Image component falls back to its identicon until the
 * file actually exists.
 */
export function thumbUrl(uuid) {
    const rel = thumbRelPath(uuid);
    if (!rel) return '';
    if (isOfflineOnly()) {
        const platform = typeof window !== 'undefined' && window.Capacitor?.getPlatform
            ? window.Capacitor.getPlatform()
            : null;
        if (platform === 'android' || platform === 'ios') {
            // Absolute file path served back by the Capacitor bridge.
            const base = deviceThumbsBaseForUrl();
            if (!base) return '';
            const fileUri = `${base}/${uuid.charAt(0)}/${uuid.charAt(1)}/${uuid}.jpg`;
            return window.Capacitor.convertFileSrc(fileUri);
        }
        // Electron: the main process maps /thumbs to the on-disk images dir;
        // browser offline fallback: no folder → placeholder handles it.
        return rel;
    }
    return serverOrigin() + rel;
}

// Lazy import indirection so the (sync) thumbUrl above never pulls the native
// plugin into web bundles unless we're on an offline mobile build.
let _deviceBaseCache = null;
function deviceThumbsBaseForUrl() {
    if (_deviceBaseCache) return _deviceBaseCache;
    try {
        const v = window.localStorage.getItem('factology.deviceThumbsBase');
        _deviceBaseCache = v || null;
    } catch (e) {
        _deviceBaseCache = null;
    }
    return _deviceBaseCache;
}

async function deviceImages() {
    return import('@factology/engine/media/deviceImages.js');
}

/**
 * Does this object currently carry a real custom image (web: server reports
 * file-vs-fallback; offline: a file exists on the device)?
 */
export async function getObjectThumbStatus(thingId) {
    if (isOfflineOnly()) {
        const mod = await deviceImages();
        if (await mod.hasDeviceThumb(thingId)) return { custom: true };
        return { custom: false };
    }
    const { data } = await axios.get(`/object/${thingId}/thumb`);
    return { custom: !!data.custom };
}

/**
 * Set an object's image/icon.
 *
 * @param {object} params
 * @param {string} params.thingId
 * @param {File}   [params.file] picked image file
 * @param {string} [params.url]  http(s) URL to import from (web/remote only)
 * @param {string} [params.size] small|medium|original (default small)
 */
export async function setObjectThumb({ thingId, file, url, size = 'small' }) {
    if (!thingId) throw new Error('thingId is required');

    if (url) {
        if (isOfflineOnly()) {
            // No server to fetch for us — try to grab the bytes client-side.
            return importThumbFromUrlOffline({ thingId, url, size });
        }
        // POST: PHP only parses multipart files on POST, and JSON posts work
        // just the same for the server (the route accepts both verbs).
        const { data } = await axios.post(`/object/${thingId}/thumb`, { url, size });
        bumpThumbRevision();
        return data;
    }

    if (!file) throw new Error('Provide a file or a url');

    const { blob } = await prepareImageFile(file, size);

    if (isOfflineOnly()) {
        const mod = await deviceImages();
        await mod.writeDeviceThumb(thingId, blob);
        bumpThumbRevision();
        return { success: true, thumb: thumbRelPath(thingId), size };
    }

    const formData = new FormData();
    // Client-encoded blobs are JPEG — use a .jpg name so the server's mimes
    // rule matches regardless of the original file (e.g. .heic). Only the
    // original-size pass-through keeps the real name.
    const fileName = size === 'original' ? (file.name || 'image') : 'image.jpg';
    formData.append('file', blob, fileName);
    if (size !== 'small') formData.append('size', size);
    // NB: no Content-Type header here — the browser must set
    // "multipart/form-data; boundary=…" itself or PHP can't parse the part.
    // POST is required: PHP only fills $_FILES for POST multipart requests.
    const { data } = await axios.post(`/object/${thingId}/thumb`, formData);
    bumpThumbRevision();
    return data;
}

/**
 * Remove the object's custom image (falls back to class icon where supported).
 */
export async function removeObjectThumb(thingId) {
    if (isOfflineOnly()) {
        const mod = await deviceImages();
        await mod.removeDeviceThumb(thingId);
        bumpThumbRevision();
        return { success: true, had_thumb: false };
    }
    const { data } = await axios.delete(`/object/${thingId}/thumb`);
    bumpThumbRevision();
    return data;
}

/** Best-effort URL import when running fully offline (subject to CORS). */
async function importThumbFromUrlOffline({ thingId, url, size }) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Could not download the image (HTTP ${response.status}).`);
    }
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
        throw new Error('The URL does not point to an image.');
    }
    const prepared = size === 'original'
        ? { blob }
        : await prepareImageFile(blob, size);
    const mod = await deviceImages();
    await mod.writeDeviceThumb(thingId, prepared.blob);
    bumpThumbRevision();
    return { success: true, thumb: thumbRelPath(thingId), size };
}

export { IMAGE_VARIANTS };
