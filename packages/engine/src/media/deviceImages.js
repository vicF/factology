// packages/engine/src/media/deviceImages.js
//
// Offline (standalone) image storage: a plain folder of files named after the
// object UUID — {a}/{b}/{uuid}.jpg — mirroring the server's thumbs layout so
// the same naming works everywhere. Stored under the app's private data dir
// (Capacitor Directory.Data) so the user keeps control of space and the files
// survive re-installs only through a proper backup.
//
// Note: an actual user-browsable folder or "reference an existing file without
// copying" (symlink-like) needs platform wiring beyond the JS layer
// (Electron main-process static route; native picker permissions) — see
// PLANS notes. This module is the storage abstraction those plug into.
//
// The native plugin is imported lazily so web/remote builds (which never run
// this code) don't need @capacitor/filesystem at runtime.

const THUMBS_SUBDIR = 'thumbs';

let cachedBaseUri = null;

function pluginReady() {
    return typeof window !== 'undefined'
        && !!window.Capacitor
        && !!window.Capacitor.isNativePlatform;
}

async function filesystemModule() {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    return { Filesystem, Directory };
}

function localStorageBase() {
    try {
        return window.localStorage.getItem('factology.deviceThumbsBase') || null;
    } catch (e) {
        return null;
    }
}

/** file:// URI (or null if unknown yet) of the images folder root. */
export function deviceThumbsBase() {
    return cachedBaseUri || localStorageBase();
}

/**
 * Resolve the app-private absolute path of a thing's image file, or null when
 * the folder base is not known (not initialized yet).
 */
export function deviceThumbPath(thingId) {
    const base = deviceThumbsBase();
    if (!base || !thingId) return null;
    return `${base}/${thingId[0]}/${thingId[1]}/${thingId}.jpg`;
}

/**
 * Initialize the folder base. Call during standalone bootstrap so thumbnails
 * resolve immediately; results are cached (also across launches) so <img> URLs
 * are stable from first render.
 */
export async function initDeviceThumbs() {
    if (!pluginReady()) return null;
    try {
        const { Filesystem, Directory } = await filesystemModule();
        const result = await Filesystem.getUri({ directory: Directory.Data, path: THUMBS_SUBDIR });
        cachedBaseUri = result.uri;
        try {
            window.localStorage.setItem('factology.deviceThumbsBase', result.uri);
        } catch (e) { /* ignore quota/sandbox errors */ }
        return cachedBaseUri;
    } catch (e) {
        return null;
    }
}

/** Ensure the folder exists. */
async function ensureFolder(Filesystem, Directory) {
    try {
        await Filesystem.mkdir({ directory: Directory.Data, path: THUMBS_SUBDIR, recursive: true });
    } catch (e) { /* already exists */ }
}

function blobToBase64(blob) {
    return blob.arrayBuffer().then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    });
}

/**
 * Store an image for an object on the device. Defaults to the file content as
 * given (already-encoded small/medium blobs, or original bytes for
 * size=original). Returns the resolved absolute path.
 */
export async function writeDeviceThumb(thingId, blob) {
    const { Filesystem, Directory } = await filesystemModule();
    await ensureFolder(Filesystem, Directory);
    await initDeviceThumbs(); // ensure cached base known
    const rel = `${THUMBS_SUBDIR}/${thingId[0]}/${thingId[1]}/${thingId}.jpg`;
    const data = await blobToBase64(blob);
    await Filesystem.writeFile({
        directory: Directory.Data,
        path: rel,
        data,
        recursive: true,
    });
    return deviceThumbPath(thingId);
}

/** Does the object have a real file on the device (vs nothing)? */
export async function hasDeviceThumb(thingId) {
    const base = deviceThumbsBase();
    if (!pluginReady() || !base) return false;
    try {
        const { Filesystem, Directory } = await filesystemModule();
        const rel = `${THUMBS_SUBDIR}/${thingId[0]}/${thingId[1]}/${thingId}.jpg`;
        const result = await Filesystem.stat({ directory: Directory.Data, path: rel });
        return result.type === 'file';
    } catch (e) {
        return false;
    }
}

/** Delete the object's image file from the device folder. */
export async function removeDeviceThumb(thingId) {
    if (!pluginReady()) return;
    try {
        const { Filesystem, Directory } = await filesystemModule();
        const rel = `${THUMBS_SUBDIR}/${thingId[0]}/${thingId[1]}/${thingId}.jpg`;
        await Filesystem.deleteFile({ directory: Directory.Data, path: rel });
    } catch (e) {
        // file did not exist — nothing to do
    }
}
