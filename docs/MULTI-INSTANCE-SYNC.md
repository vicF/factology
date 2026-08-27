# Factology: Multi-Instance Identity, Sync & Sharing

## Context

Factology runs as one Vue 3 SPA in three wrappers: **web** (Laravel + Postgres + Sanctum email/password), **mobile** (Capacitor/Android), **desktop** (Electron). Identity today is email+password on a per-server DB; the durable handle is `users.thing_id` (a UUID that is also a `things` graph node). Mobile/desktop already have a mature offline layer (`localDb` Dexie with `_syncStatus`, `_serverRevision`, `pendingChanges` queue, `syncMetadata`) and a `SyncEngine.js` that calls `POST /sync/pull` + `POST /sync/push` — **endpoints that don't exist on the server yet**.

Goals: (1) one identity across all instances, (2) sync chosen objects between own devices — private objects NOT stored on the server (may be transiently relayed), (3) import/publish global public objects from/to the server, (4) share objects with friends (server / direct / encrypted files), (5) minimize server-held personal data (anonymous to global community).

**Confirmed decisions:** private sync = server-as-transient E2E relay (files/P2P opt-in later); identity = client-generated keypair as root of trust, email+password kept as optional decoupled server-account layer; share default = object + directly linked non-private neighbors.

**Feedback incorporated:** revisions clarified (see §2); merging is a separate task — same-owner conflicts resolve LWW by updated date; `link_uuid` is the canonical link key; **there is no central server** — multiple servers are peers and **a server is itself an object** (type=SERVER).

**This session's deliverable:** write this design to `factology/docs/MULTI-INSTANCE-SYNC.md` and commit it. Phase 0 implementation happens later, in a worktree.

---

## 1. Concept design

### 1.1 Identity (Phase 1)
- `identity_id === thing_id` (the person's `things` row). No new account table.
- First device generates a keypair (WebCrypto Ed25519 signing + X25519/ECDH for E2E). Onboarding: "create new identity" / "I already have one". Recovery paths, user's choice:
  - **Self-custody**: BIP-39-style mnemonic (human-transferable) or **QR** (same-room fast path).
  - **Social recovery (K-of-N, friends help restore)**: the identity's master secret (from which the keypair derives) is split via **Shamir's Secret Sharing** into N shares; the user picks N trusted friends and a minimum threshold K (e.g. 3-of-5). Each share is **encrypted to that friend's public key** (so only they can read it — consistent with E2E) and stored in the friend's contact record for this user. On key loss, the user proves identity to ≥K friends out-of-band, collects their shares, recombines, and re-derives the keypair. Requires all K in the "all-of-N" variant, or any K of N in the threshold variant.
  - **Server-mediated backup** (optional, for users who accept the trade-off): encrypted recovery blob held by a server, decrypted with a recovery secret.
- Second device links to the identity: authorized by an already-authenticated device; server keeps a lightweight `devices` table (`device_id → identity_id → public_key`) — public keys only.
- New server tables: `identity_keys` (`identity_id`, `public_key`, optional `display_name` — the only PII), `devices`. Email+password stays, decoupled: it authenticates a `users` row whose `thing_id` is the identity; identity works without it.

### 1.2 Multi-server topology (no central server)
- **Any instance can be a server.** The same API/SyncController code runs on every server instance (a user's local server, a remote public server, the current web app). There is no central authority.
- **A server is itself an object**: servers are `things` of `type=SERVER` (type 6), identified by `server_uuid` (`settings.server_uuid`). Server objects (uuid, name, url) can be discovered and synced like any other objects — a device knows its configured servers by listing SERVER things.
- A client connects to **N servers at once** (its own local server + several remote ones). `SyncEngine` already iterates multiple `serverIds` (`syncMetadata` is per-server; `pendingChanges` carries `serverId`). Each server's pull/push is independent.
- **Provenance**: `server_uuid` on every row records the authoritative source. The same public object may legitimately exist on several servers; LWW by updated date resolves drift; the owner field still governs writes.

### 1.3 Sync (Phases 0 + 2 + 3)
Two channels:
- **(a) Private device↔device** (Phase 2): server-as-transient-relay. Device encrypts object bundles to the *receiver's* public key; server stores only ciphertext blobs addressed to a public-key fingerprint, with TTL (`POST /relay/blob`, `GET /relay/blob/{id}`). Works when devices aren't online simultaneously. Content and recipient graph unreadable by the server.
- **(b) Server object sync** (Phase 0 + 3): owned + public objects ride the same `/sync/pull` + `/sync/push` endpoints, **AuthScope applied server-side** (owner OR public OR group). Global import = read of public data; publish = write of `public=true`. A `subscriptions` store (local) selects which global objects/classes to pull from which server.

### 1.4 Sharing (Phase 4)
- **Friends** = device-local Dexie `friends` store (contact-book style: friend identity_id, my display name, exchanged public key). Friendship is also a `FRIEND_OF` graph link so it syncs between my devices.
- Hybrid sharing chosen by object privacy: `public=true` → normal server sync (indexed, AuthScope). `public=false` shared with a friend → **E2E-encrypted share bundle** (object + direct non-private links) encrypted to the friend's public key; server sees only opaque blobs / key fingerprints.
- New link types `FRIEND_OF`/`SAFE_WITH`; legacy `GROUP_READ_ACCESS`/`BELONGS_TO_USER_GROUP` kept as deprecated read-compat aliases only.

### 1.5 Server data minimization
Server stores: public objects, `identity_keys` (public keys + optional display name), `devices`, transient encrypted relay blobs, optional email+password row. Never stores private object plaintext, private keys, friend contact labels, or subscription prefs.

### 1.6 Encrypted files (Phase 5)
Extend `ExportImportController` with encrypted mode: AES-GCM envelope + per-file data key wrapped to recipient's public key (hybrid). Metadata header cleartext (recipient fingerprint), all object/link content ciphertext. Decryption only on devices — never on the server. `server_uuid` provenance lives inside ciphertext.

**Phases (each independently shippable):** 0 = sync endpoints → 1 = identity → 2 = private relay → 3 = global import/publish → 4 = friends/sharing → 5 = encrypted files/P2P.

---

## 2. Key design clarifications

### 2.1 What "revision" is for — and what it is NOT for
The client (`SyncEngine.js`/`ConflictResolver.js`) uses `_serverRevision` **only as a per-record "server changed since my last sync" signal** for conflict *detection* and as the incremental-pull watermark. It is never used to *merge* content.

- **Incremental pull watermark**: client sends `since`; server returns rows with `revision > since` plus `server_timestamp` = max revision. An integer counter is required because timestamps are fragile: `links` has **no** `record_updated` column today, second-precision timestamps can collide (missed rows), and the client's `_markSynced` blindly does `_serverRevision + 1` on accept (corrupts timestamp-based values). Hence an explicit monotonic `revision BIGINT` on both tables, bumped by a shared Postgres sequence + `AFTER INSERT/UPDATE` trigger (single reliable bump point across ApiController/import/seeders).
- **Conflict/merge policy (Phase 0)**: same owner → **latest by `record_updated` wins** (LWW by updated date — as you specified). No field-level merging in Phase 0; merging is a separate future task (the client `ConflictResolver` exists but stays dormant; the server just rejects older payloads and returns the server version).
- **Revisions are a counter, not a timestamp, not a merge key.**

### 2.2 `link_uuid` is the canonical link key
- The sync layer must treat **`link_uuid`** (immutable, NOT NULL, `gen_random_uuid()` default) as the identity of a link — not `link_id` (auto-increment PK, differs between instances).
- **Client fix needed**: `SyncEngine._applyServerLink` (line ~375) matches via `getLink(link.link_id)` — change to match by `link_uuid` first (keep the local record's PK on match), and add a `link_uuid` index to the local `links` store in `localDb/schema.js` if absent.
- Server push matches by `payload.link_uuid`, then unique-triple fallback (as `ExportImportController::import` already does); never regenerates an existing `link_uuid`.
- Full `link_id`→`link_uuid` replacement as the PK is a follow-up cleanup task, not required for sync.

### 2.3 Multi-server protocol rules
- `server_id` in requests = the server's own `server_uuid`. No endpoint may assume it is "the" central server.
- Pull scopes rows by AuthScope of the *requesting identity* on *this server* — a device receives, per server: its owned objects + that server's public objects.
- `server_uuid` provenance must be preserved on every row through push/pull/import; pushing a row whose `server_uuid` differs from this server's is fine (it becomes mirrored/moved), but the row is still keyed by `thing_id`/`link_uuid`.

---

## 3. Phase 0: `/sync/pull` + `/sync/push` (later, in a worktree)

### Client contract to satisfy (verified in `resources/js/sync/SyncEngine.js`)
- **pull** — POST `/api/v1/sync/pull` `{ server_id, since }`. Response `{ changes: { objects: [...], links: [...] }, server_timestamp }`. Objects carry `thing_id`, `deleted`, `_serverRevision`, `server_id`. Links carry `link_uuid`, `_serverRevision`.
- **push** — POST `/api/v1/sync/push` `{ server_id, changes: { objects: [{operation, record_id, payload}], links: [...], media: [...] } }`. Response `{ accepted: [record_ids...], conflicts: [{record_id, server_version, reason}], server_timestamp }`. `accepted` echoes the client's `record_id`s.

### 3.1 Migration
`add_revision_to_things_and_links`: shared sequence `sync_revision_seq`; `revision BIGINT NOT NULL DEFAULT 0` on `things` and `links`; PL/pgSQL function + `AFTER INSERT OR UPDATE` triggers setting `revision = nextval(...)`.

### 3.2 `app/Http/Controllers/SyncController.php` (auth:sanctum)
- **pull(server_id, since):** things where `revision > since` AND AuthScope-visible (owner OR public OR group); links where `revision > since` AND (`public` OR caller owns an endpoint), rows carry `link_uuid`. Soft-deleted rows included (`deleted=true`). Response rows: `_serverRevision = revision`, `server_id` = server uuid. `server_timestamp` = max revision seen.
- **push(server_id, changes):** per object — match by `thing_id`; ownership check (caller owns, or public/system); exists → LWW by `record_updated`; caller's older → `conflicts[]` with full `server_version` row. New → insert with `server_uuid` = this server's uuid. Per link — match by `payload.link_uuid` then unique-triple; honor soft-delete; never regenerate `link_uuid`. `accepted[]` echoes client `record_id`s. **Media:** acknowledged as accepted, no-op for now (Phase 0 limitation).

### 3.3 Routes (`routes/api.php`)
```php
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/sync/pull', [SyncController::class, 'pull']);
    Route::post('/sync/push', [SyncController::class, 'push']);
});
```

### 3.4 Client fix
`_applyServerLink` matches by `link_uuid` (see §2.2); local `links` store gains a `link_uuid` index.

### Files
- **Create:** `factology/docs/MULTI-INSTANCE-SYNC.md` (this session); later `database/migrations/<date>_add_revision_to_things_and_links.php`, `app/Http/Controllers/SyncController.php`
- **Modify:** `routes/api.php`, `resources/js/sync/SyncEngine.js`, `resources/js/localDb/schema.js`, tests
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
