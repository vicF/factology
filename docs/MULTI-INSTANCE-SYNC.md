# Factology: Multi-Instance Identity, Sync & Sharing

## Context

Factology runs as one Vue 3 SPA in three wrappers: **web** (Laravel + Postgres + Sanctum email/password), **mobile** (Capacitor/Android), **desktop** (Electron). Identity today is email+password on a per-server DB; the durable handle is `users.thing_id` (a UUID that is also a `things` graph node). Mobile/desktop already have a mature offline layer (`localDb` Dexie with `_syncStatus`, `_serverRevision`, `pendingChanges` queue, `syncMetadata`) and a `SyncEngine.js` that calls `POST /sync/pull` + `POST /sync/push` — **endpoints that don't exist on the server yet**.

Goals: (1) one identity across all instances, (2) sync chosen objects between own devices — private objects NOT stored on the server (may be transiently relayed), (3) import/publish global public objects from/to the server, (4) share objects with friends (server / direct / encrypted files), (5) minimize server-held personal data (anonymous to global community).

**Confirmed decisions:** private sync = server-as-transient E2E relay (files/P2P opt-in later); identity = client-generated keypair as root of trust, email+password kept as optional decoupled server-account layer; share default = object + directly linked non-private neighbors.

**Feedback incorporated:** revisions clarified (see §2); merging is a separate task — same-owner conflicts resolve LWW by updated date; `link_uuid` is the canonical link key; **there is no central server** — multiple servers are peers and **a server is itself an object** (type=SERVER); identity travels as a portable key file (§1.1) with **no email or personal data on the server**; **`owner` is immutable** on import — mismatched-owner objects are rejected and reported, and received files are signature-verified (§1.7).

**This session's deliverable:** write this design to `factology/docs/MULTI-INSTANCE-SYNC.md` and commit it. Phase 0 implementation happens later, in a worktree.

---

## 1. Concept design

### 1.1 Identity (Phase 1)
- `identity_id === thing_id` (the person's `things` row). No new account table.
- **Identity is a portable key file.** Generate the identity on one app (web at localhost:8003, desktop, or mobile), export it as a small file, and import it on another app — the second app then uses the **same owner uuid (`thing_id`)**, same display name, and the same signing/decryption keys. The file is the identity: `{ type, version, thing_id, name, public_key, private_key }` — the private key is **encrypted under a required passphrase** (PBKDF2-SHA256 → AES-GCM); the BIP-39 mnemonic is the human recovery form and re-derives the exact keypair without the passphrase.
- **Two creation paths:**
  - **Adopt an existing account** (today's web app): bind the account's `users.thing_id` to a freshly generated keypair → identity file. Existing objects stay owned by the same uuid; no re-owning.
  - **Fresh self-sovereign identity** (privacy-first): new keypair + new `thing_id` derived from the public key (verifiable: the owner field IS a key fingerprint). No account, no email, nothing personal on the server.
- Keypair: WebCrypto Ed25519 signing + X25519/ECDH for E2E. The master secret deterministically derives **both** keys (HKDF subkeys), so one mnemonic restores the whole identity. Recovery paths, user's choice:
  - **Self-custody**: BIP-39-style mnemonic (human-transferable) or **QR** (same-room fast path).
  - **Social recovery (K-of-N, friends help restore)**: the identity's master secret is split via **Shamir's Secret Sharing** into N shares; the user picks N trusted friends and a minimum threshold K (e.g. 3-of-5). Each share is **encrypted to that friend's public key** (so only they can read it — consistent with E2E) and stored in the friend's contact record for this user. On key loss, the user proves identity to ≥K friends out-of-band, collects their shares, recombines, and re-derives the keypair. Requires all K in the "all-of-N" variant, or any K of N in the threshold variant.
  - **Server-mediated backup** (optional, for users who accept the trade-off): encrypted recovery blob held by a server, decrypted with a recovery secret.
- **No email, no personal data on the server** (confirmed direction). The `users` table / email-password becomes an optional legacy layer for the existing web deployment; new identities work without it. Server keeps only: public objects, `identity_keys` (`identity_id`, `public_key`, optional `display_name`), `devices`, transient encrypted relay blobs.
- Second device adopts the identity via the identity file (or QR). Server keeps a lightweight `devices` table (`device_id → identity_id → public_key`) — public keys only.

### 1.2 Multi-server topology (no central server)
- **Any instance can be a server.** The same API/SyncController code runs on every server instance (a user's local server, a remote public server, the current web app). There is no central authority.
- **A server is itself an object**: servers are `things` of `type=SERVER` (type 6), identified by `server_uuid` (`settings.server_uuid`). A server creates its own SERVER thing on setup (`public=false`, migration `2026_07_09_000002`) — private, so it syncs only to its owner's devices. Remote servers may expose a public SERVER thing (uuid, name, url) for discovery, or be added manually. A device knows its configured servers by listing SERVER things + manually configured URLs.
- A client connects to **N servers at once** (its own local server + several remote ones). `SyncEngine` already iterates multiple `serverIds` (`syncMetadata` is per-server; `pendingChanges` carries `serverId`). Each server's pull/push is independent.
- **Provenance**: `server_uuid` on every row records the authoritative source. The same public object may legitimately exist on several servers; LWW by updated date resolves drift; the owner field still governs writes.

### 1.3 Sync (Phases 0 + 2 + 3)
Two channels:
- **(a) Private device↔device** (Phase 2): server-as-transient-relay. Device encrypts object bundles to the *receiver's* public key; server stores only ciphertext blobs addressed to a public-key fingerprint, with TTL (`POST /relay/blob`, `GET /relay/blob/{id}`). Works when devices aren't online simultaneously. Content and recipient graph unreadable by the server.
- **(b) Server object sync** (Phase 0 + 3): owned + public objects ride the same `/sync/pull` + `/sync/push` endpoints, **AuthScope applied server-side** (owner OR public OR group). **Home-server rule:** "owned" (private) objects sync only to the identity's *own* server(s) — the servers its account lives on, where its private data already resides (today's web app is the canonical one). Remote/community servers accept only public objects (plus relay blobs), so private plaintext never leaves the owner's own server. Global import = read of public data; publish = write of `public=true`. A `subscriptions` store (local) selects which global objects/classes to pull from which server.

### 1.4 Sharing (Phase 4)
- **Friends** = device-local Dexie `friends` store (contact-book style: friend identity_id, my display name, exchanged public key). Friendship is also a `FRIEND_OF` graph link so it syncs between my devices.
- Hybrid sharing chosen by object privacy: `public=true` → normal server sync (indexed, AuthScope). `public=false` shared with a friend → **E2E-encrypted share bundle** (object + direct non-private links) encrypted to the friend's public key; server sees only opaque blobs / key fingerprints.
- New link types `FRIEND_OF`/`SAFE_WITH`; legacy `GROUP_READ_ACCESS`/`BELONGS_TO_USER_GROUP` kept as deprecated read-compat aliases only.

### 1.5 Server data minimization
Server stores: public objects, `identity_keys` (public keys + optional display name), `devices`, transient encrypted relay blobs, optional email+password row. Never stores private object plaintext, private keys, friend contact labels, or subscription prefs. (Exception: the identity's *own* server may hold its private objects, as today's web server does; the minimization guarantee applies to every other server.)

### 1.6 Encrypted files (Phase 5)
Extend `ExportImportController` with encrypted mode: AES-GCM envelope + per-file data key wrapped to recipient's public key (hybrid). Metadata header cleartext (recipient fingerprint), all object/link content ciphertext. Decryption only on devices — never on the server. `server_uuid` provenance lives inside ciphertext.

### 1.7 Owner integrity & signed imports (confirmed)
`owner` is immutable in normal operation — no import/sync path ever rewrites it. When the app receives an object file, it must first verify the file is from a trusted source, then apply these rules per object:
- **Owned by the importing identity** → editable (the normal flow: I exported my own objects from another app of mine).
- **Not owned by the importing identity** → read-only copy; edits forbidden (admin exception only).
- **Already owned by the importing identity locally, but the file claims a different owner** → **error**: ignore the object, record and report the mismatch. The file is either tampered with or from an untrusted source.
- Files are **signed by the object's owner** (Ed25519 over the payload). The receiver verifies the signature against the owner's public key (`identity_keys`, own identity file, or a friend's exchanged key) before applying. Unsigned/mismatched files are rejected with a per-object report.

**Phases (each independently shippable):** 0 = sync endpoints → 1 = identity → 2 = private relay → 3 = global import/publish → 4 = friends/sharing → 5 = encrypted files/P2P.

---

## 2. Key design clarifications

### 2.1 What "revision" is for — and what it is NOT for
The client (`SyncEngine.js`/`ConflictResolver.js`) uses `_serverRevision` **only as a per-record "server changed since my last sync" signal** for conflict *detection* and as the incremental-pull watermark. It is never used to *merge* content.

- **Incremental pull watermark**: client sends `since`; server returns rows with `revision > since` plus `server_timestamp` = max revision. An integer counter is required because timestamps are fragile: second-precision timestamps can collide (missed rows), and the client's `_markSynced` blindly does `_serverRevision + 1` on accept (corrupts timestamp-based values). (`links` originally had no `record_updated` at all — added in `2026_08_27_000001`.) Hence an explicit monotonic `revision BIGINT` on the `things` table, bumped by a shared Postgres sequence + `AFTER INSERT/UPDATE` trigger (single reliable bump point across ApiController/import/seeders). Links deliberately skip the counter (§3.1) and use `record_updated` as the watermark, accepting the collision trade-off.
- **Conflict/merge policy (Phase 0)**: same owner → **latest by `record_updated` wins** (LWW by updated date — as you specified). No field-level merging in Phase 0; merging is a separate future task (the client `ConflictResolver` exists but stays dormant; the server just rejects older payloads and returns the server version).
- **Links use `record_updated` for LWW** (implemented in `2026_08_27_000001`): `links` had no modified-date; it now has `record_updated` (NOT NULL, default now, stamped on every write), so links LWW by the same updated-date rule as objects. Per decision, links get **no** `revision` counter — `record_updated` also serves as the links pull watermark, accepting the second-precision collision trade-off (revisit if it bites).
- **Revisions are a counter, not a timestamp, not a merge key.**

### 2.2 `link_uuid` is the canonical link key
- The sync layer must treat **`link_uuid`** (immutable, NOT NULL, `gen_random_uuid()` default) as the identity of a link — not `link_id` (auto-increment PK, differs between instances).
- **Client fix (implemented)**: `SyncEngine._applyServerLink` now matches by `link_uuid` first (keeps the local record's PK on match) with a `link_uuid` index on the local `links` store (`localDb/schema.js`, DB v2). For a link with no local match it generates the local `link_id` (`crypto.randomUUID()`); the server's `link_id` is instance-specific and is never used as the local PK.
- Server push matches by `payload.link_uuid`, then unique-triple fallback (as `ExportImportController::import` already does); never regenerates an existing `link_uuid`.
- Full `link_id`→`link_uuid` replacement as the PK is a follow-up cleanup task, not required for sync.

### 2.3 Multi-server protocol rules
- `server_id` in requests = the server's own `server_uuid`. No endpoint may assume it is "the" central server.
- Pull scopes rows by AuthScope of the *requesting identity* on *this server* — a device receives, per server: its owned objects + that server's public objects.
- `server_uuid` provenance must be preserved on every row through push/pull/import; pushing a row whose `server_uuid` differs from this server's is fine (it becomes mirrored/moved), but the row is still keyed by `thing_id`/`link_uuid`.

---

## 3. Phase 0: `/sync/pull` + `/sync/push` (later, in a worktree)

### Client contract to satisfy (verified in `resources/js/sync/SyncEngine.js`)
- **pull** — POST `/api/v1/sync/pull` `{ server_id, since }`. Response `{ changes: { objects: [...], links: [...] }, server_timestamp }`. Objects carry `thing_id`, `deleted`, `_serverRevision`, `server_id`. Links carry `link_uuid`, `_serverRevision`. The server MUST always include `changes`, even if both arrays are empty — if the key is absent, `SyncEngine.pull` returns early without advancing the pull watermark.
- **push** — POST `/api/v1/sync/push` `{ server_id, changes: { objects: [{operation, record_id, payload}], links: [...], media: [...] } }`. Response `{ accepted: [record_ids...], conflicts: [{record_id, server_version, reason}], server_timestamp }`. `accepted` echoes the client's `record_id`s.

### 3.1 Migrations
- **Implemented** `add_record_updated_to_links` (`2026_08_27_000001`): `record_updated` on `links`, NOT NULL, `DEFAULT CURRENT_TIMESTAMP`; stamped `now()` on every link write (`ApiController::storeLink`). Links LWW by this date — **links get no `revision` counter** (decision: `record_updated` doubles as the links watermark; revisit if second-precision collisions bite).
- **Planned** `add_revision_to_things`: shared sequence `sync_revision_seq`; `revision BIGINT NOT NULL DEFAULT 0` on `things`; PL/pgSQL function + `AFTER INSERT OR UPDATE` trigger setting `revision = nextval(...)`; used as the things incremental-pull watermark.

### 3.2 `app/Http/Controllers/SyncController.php` (auth:sanctum)
- **pull(server_id, since):** things where `revision > since` AND AuthScope-visible (owner OR public OR group); links where `record_updated > since` AND (`public` OR caller owns an endpoint — `links` has no `owner` column; "owns an endpoint" = `one_thing_id`/`other_thing_id` resolves to a thing the caller owns), rows carry `link_uuid`. Soft-deleted rows included (`deleted=true`). Response rows: `_serverRevision` = revision (things) / `record_updated` epoch (links), `server_id` = server uuid. `server_timestamp` = max revision/`record_updated` seen.
- **push(server_id, changes):** per object — match by `thing_id`; ownership check (caller owns, or public/system); exists → LWW by `record_updated`; caller's older → `conflicts[]` with full `server_version` row. New → insert with `server_uuid` = this server's uuid. Per link — match by `payload.link_uuid` then unique-triple; exists → LWW by `record_updated`; honor soft-delete; never regenerate `link_uuid`. `accepted[]` echoes client `record_id`s. **Media:** acknowledged as accepted, no-op for now (Phase 0 limitation).

### 3.3 Routes (`routes/api.php`)
```php
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/sync/pull', [SyncController::class, 'pull']);
    Route::post('/sync/push', [SyncController::class, 'push']);
});
```

### 3.4 Client fix
`_applyServerLink` matches by `link_uuid` (see §2.2); local `links` store gains a `link_uuid` index. **Implemented** (with `localDb` v2 + `getLinkByUuid`/`newLinkId`).

### Files
- **Done:** `factology/docs/MULTI-INSTANCE-SYNC.md`, `database/migrations/2026_08_27_000001_add_record_updated_to_links.php`, `resources/js/sync/SyncEngine.js`, `resources/js/localDb/schema.js` (v2), `resources/js/localDb/links.js`, `app/Http/Controllers/ApiController.php` (`storeLink`), tests
- **Later:** `database/migrations/<date>_add_revision_to_things.php`, `app/Http/Controllers/SyncController.php`, `routes/api.php`
- **Reuse:** `ExportImportController` import machinery, `AuthScope`, `Everything::save` ownership semantics

### Verification (when Phase 0 is implemented)
1. PHPUnit feature tests for SyncController (`RefreshDatabase`): AuthScope scoping, incremental `since`, push insert/update/delete + ownership rejection + LWW conflicts + `link_uuid` matching.
2. `docker exec factology-test sh -c "php artisan test --compact"` — only the two known develop failures expected (login scenario, class-tree folding).
3. Round trip: seed public object on one container, run SyncEngine from a second instance (worktree dev container) against the API, confirm it lands in local Dexie.
4. Full suite once: `bash run-tests.sh --no-mobile` (per TESTING_PLAYBOOK.md).

---

## Open questions (before Phases 4–5)
- **Social recovery mechanics**: split on the *master secret* (re-derives the whole keypair — simpler) vs. per-key threshold signing (more complex, never reassembles a private key)? How do friends prove the requester's identity before returning a share (out-of-band challenge)? What happens when a trusted friend is removed (share rotation → re-split N/K)?
- **Share depth policy**: default for "object + direct links"; cap to avoid leaking deep private graphs.
- **Retention/moderation**: relay-blob TTL; moderation for the public/global channel; GDPR treatment of key fingerprints.
- **Server-mediated recovery**: offer as opt-in alongside self-custody + social recovery, or exclude entirely to honor data minimization?
