# Object images (bring back)

Any object may have an image/icon. Images are single files named after the
object UUID, in the classic layout:

    {root}/{uuid[0]}/{uuid[1]}/{uuid}.jpg
    root = web server:      public/thumbs        (legacy Everything::getThumbPathById)
           device (offline): app-private folder  (Capacitor Directory.Data/thumbs)

The web server serves them at `/thumbs/…` (also used as the fallback URL in
Electron). No DB column exists — file presence is the image; a symlink in the
thumbs tree points a class-less object to its class/parent icon.

## Server (web / Laravel)
- `App\Services\ThumbStore` — GD encoder (no external image lib). Variants:
  small 100px/q20 (matches the historic ~1 KB icon profile, default, economizes
  server storage), medium 512px/q80, original full-dim/q85. `put()` overwrites
  existing file or class symlink; `remove()` deletes and restores the
  class/parent fallback symlink. Root dir overridable via config
  `app.thumbs_base` (tests use storage/framework/testing/thumbs).
- `Everything::saveThumb()` no longer references the removed claviska\SimpleImage;
  it delegates to ThumbStore.
- API (routes/api.php, auth group):
  - `PUT    /api/v1/object/{id}/thumb` multipart `file` OR JSON `{url}`; `size`
    query/body (small default).
  - `DELETE /api/v1/object/{id}/thumb` remove custom image → restore fallback.
  - `GET    /api/v1/object/{id}/thumb` status: `{custom: bool}` (custom = real
    file, not symlink). Used to decide whether "Remove" applies.
  - Same ownership rule as delete (owner or admin).
- URL import: Http GET, guards content-type image/*, Content-Length and total
  body (ThumbStore::MAX_SOURCE_BYTES).

## Frontend
- `resources/js/utils/imageEditing.js` — client encode (canvas, EXIF handled by
  createImageBitmap from-image). small/medium → JPEG blob sized per profile;
  original passes raw bytes through.
- `resources/js/utils/objectImages.js` — façade: thumbUrl/thumbRelPath,
  getObjectThumbStatus / setObjectThumb / removeObjectThumb. Web/remote → axios
  to the server; standalone offline → ../media/deviceImages. `thumbRevision`
  (reactive) bumps on every change; URLs append `?v=` so replaced images
  re-fetch (provided in layouts/Default.vue).
- `resources/js/media/deviceImages.js` — offline device-folder storage using
  `@capacitor/filesystem` (Directory.Data/thumbs, base cached in localStorage),
  base resolved at bootstrap (standaloneBootstrap). Lazy `import()` of the
  plugin keeps it out of web runtime.
- `resources/js/components/ObjectImageEditor.vue` — preview + Upload / From URL
  / Remove + size selector (small/medium/original). Embedded in EditObject.vue
  for existing objects only (fresh objects get an image after first save).

## Offline modes
- Android/iOS Capacitor: real files under Directory.Data/thumbs;
  `thumbUrl` → `Capacitor.convertFileSrc(basePath)`.
- Electron (built on develop branch): its main process already runs a local
  static HTTP server over the SPA; extend it to also map `/thumbs/…` to an
  images dir under userData (D:/factology-desktop-data). Renderer thumbUrl
  stays `/thumbs/…`. Object deletion removes the local file (dataLayer).

## Still to wire (native projects live outside this worktree)
1. Electron main: serve the device images dir at `/thumbs/…`; IPC or
   main-process write for uploads; optional real-symlink "reference an existing
   file without copying".
2. Remote-mode Capacitor (VITE_API_URL set): thumb edits currently target the
   local adapter, which only implements the device-folder routes for the
   standalone build. For server-backed objects add an upload queue mirroring
   pendingChanges, or forward to the server.
3. iOS: verify convertFileSrc/cleartext scheme config for an http androidScheme
   style setup (may need https scheme instead).
4. User-visible/managed folder on Android (MediaStore/Documents) if "browse
   without the app" matters there.
