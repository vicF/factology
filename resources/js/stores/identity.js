// resources/js/stores/identity.js
//
// Self-sovereign identity store — multi-identity registry.
//
// The device stores a registry of identity FILES (each encrypted under its own
// passphrase). Any subset of them can be UNLOCKED simultaneously (keys held in
// memory only). Visibility across the app is the union of unlocked owners +
// system rows (see localDb/visibility.js). A per-device PRIMARY identity owns
// newly created objects while several are unlocked.
//
// Per-identity setting requirePassphraseOnOpen (default OFF = convenience):
//   - OFF: an auto-open token (the file-decryption key, never the passphrase)
//     is stored in device storage, so the app reopens the identity without
//     asking.
//   - ON: no token is kept; the app asks for the passphrase after every restart
//     and the identity starts locked.
//
// Guest mode (no identity ever stored) is read-only over shared/system data.

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { storage } from '../utils/storage';
import {
    createIdentity,
    openIdentityFile,
    buildAutoOpenToken,
    openIdentityFileWithToken,
} from '../identity/identity';

const REGISTRY_KEY = 'factology_identity_registry';
const LEGACY_KEY = 'factology_identity_file';

const blankRegistry = () => ({
    version: 1,
    items: [], // { thingId, name, publicKey, file, requirePassphraseOnOpen, autoOpen, createdAt }
    primaryThingId: null,
    guestMode: false, // user deliberately chose "continue as guest" (no identity yet)
    legacyAdopted: false, // pre-identity rows ('local-user-thing'/null) adopted yet?
});

/** Merge a persisted registry with defaults so old shapes keep working. */
function normalizeRegistry(raw) {
    const base = blankRegistry();
    if (!raw || typeof raw !== 'object') return base;
    return {
        ...base,
        ...raw,
        items: Array.isArray(raw.items)
            ? raw.items.map((item) => ({
                thingId: item.thingId ?? item.file?.thing_id,
                name: item.name ?? item.file?.name ?? 'Identity',
                publicKey: item.publicKey ?? item.file?.public_key ?? null,
                file: item.file ?? null,
                requirePassphraseOnOpen: !!item.requirePassphraseOnOpen,
                autoOpen: item.autoOpen && item.autoOpen.token
                    ? { enabled: !!item.autoOpen.enabled, token: item.autoOpen.token }
                    : { enabled: false, token: null },
                createdAt: item.createdAt ?? new Date().toISOString(),
            }))
            : [],
        primaryThingId: raw.primaryThingId ?? null,
        guestMode: !!raw.guestMode,
        legacyAdopted: !!raw.legacyAdopted,
    };
}

const makeItem = (file) => ({
    thingId: file.thing_id,
    name: file.name,
    publicKey: file.public_key,
    file,
    requirePassphraseOnOpen: false,
    autoOpen: { enabled: false, token: null },
    createdAt: new Date().toISOString(),
});

export const useIdentityStore = defineStore('identity', () => {
    const registry = ref(blankRegistry());
    const loaded = ref(false);
    const unlockedMap = ref(new Map()); // thingId -> opened {thingId,name,secretKey,publicKey,file}

    let restorePromise = null;

    // ── Derived ──────────────────────────────────────────────────────
    const items = computed(() => registry.value.items || []);
    const primaryItem = computed(() =>
        items.value.find((i) => i.thingId === registry.value.primaryThingId)
        || items.value[0]
        || null);
    const unlockedSet = computed(() => new Set(unlockedMap.value.keys()));
    const unlocked = computed(() => unlockedMap.value.size > 0);
    const guestMode = computed(() => !!registry.value.guestMode);
    // The unlocked PRIMARY (fallback: first unlocked identity) — this is the
    // session owner (who new objects belong to).
    const primary = computed(() => {
        const item = primaryItem.value;
        if (item && unlockedMap.value.has(item.thingId)) {
            return unlockedMap.value.get(item.thingId);
        }
        return unlockedMap.value.values().next().value || null;
    });
    // Back-compat accessors (single-identity era). `identity` = unlocked
    // primary; `identityFile` = the primary item's stored file (or null).
    const identity = computed(() => primary.value);
    const identityFile = computed(() => {
        const item = primaryItem.value;
        return item ? item.file : null;
    });

    // ── Persistence ──────────────────────────────────────────────────
    async function persist() {
        await storage.set(REGISTRY_KEY, JSON.stringify(registry.value));
    }

    async function clearSessionStorage() {
        const { useAuthStore } = await import('../stores/auth');
        const authStore = useAuthStore();
        authStore.authenticated = false;
        authStore.user = null;
        authStore.token = null;
        await storage.remove('user');
        await storage.remove('auth_token');
        delete authStore.axiosDefaultHeader?.value; // no-op safety
    }

    /**
     * Point the auth session at the current unlocked primary so the whole UI
     * (edit mode, profile, new-object owner) treats that identity as the user.
     * When nothing is unlocked, drop any identity-based session (guest).
     */
    async function refreshSession() {
        try {
            const active = primary.value;
            if (active) {
                const { useAuthStore } = await import('../stores/auth');
                const authStore = useAuthStore();
                if (authStore.user?.thing_id !== active.thingId) {
                    await authStore.login(
                        { id: active.thingId, thing_id: active.thingId, name: active.name, is_admin: false },
                        `identity-${active.thingId}`,
                    );
                }
            } else {
                const { useAuthStore } = await import('../stores/auth');
                const authStore = useAuthStore();
                const isIdentitySession = typeof authStore.token === 'string'
                    && authStore.token.startsWith('identity-');
                if (isIdentitySession || authStore.user?.thing_id) {
                    await clearSessionStorage();
                }
            }
        } catch (e) {
            // Auth session mirroring is best-effort (needs an app/router
            // context); identity unlock itself must never fail because of it.
            console.warn('identity: session refresh skipped', e?.message || e);
        }
    }

    // ── Restore / migration ──────────────────────────────────────────
    async function doRestore() {
        loaded.value = true;
        let raw;
        try {
            raw = await storage.get(REGISTRY_KEY);
        } catch (e) {
            raw = null;
        }
        if (!raw) {
            // Migrate the pre-registry single identity file, if present.
            try {
                const legacy = await storage.get(LEGACY_KEY);
                if (legacy) {
                    const file = JSON.parse(legacy);
                    if (file && file.type === 'factology-identity' && file.thing_id) {
                        registry.value = blankRegistry();
                        registry.value.items = [makeItem(file)];
                        registry.value.primaryThingId = file.thing_id;
                        await persist();
                        await storage.remove(LEGACY_KEY);
                    }
                }
            } catch (e) {
                console.warn('identity: failed to migrate legacy identity file', e);
            }
        } else {
            try {
                registry.value = normalizeRegistry(JSON.parse(raw));
            } catch (e) {
                console.warn('identity: corrupt registry, starting fresh', e);
                registry.value = blankRegistry();
            }
        }
        // Auto-reopen is an offline-app convenience (it establishes the local
        // session). In web/server mode an identity must not silently take over
        // the account session.
        if (import.meta.env.VITE_TARGET === 'capacitor') {
            await unlockAllAuto();
        }
    }

    async function restore() {
        if (restorePromise) return restorePromise;
        restorePromise = doRestore();
        return restorePromise;
    }

    function invalidateRestore() {
        restorePromise = null;
        loaded.value = false;
    }

    // ── Unlock helpers ───────────────────────────────────────────────
    function setUnlocked(opened) {
        unlockedMap.value = new Map(unlockedMap.value).set(opened.thingId, opened);
    }

    /**
     * The first time any identity unlocks on this device, adopt anonymous
     * pre-identity rows ('local-user-thing'/no owner) so they become visible
     * under the new owner-based filter instead of vanishing.
     */
    async function adoptLegacyOnFirstUnlock(thingId) {
        if (registry.value.legacyAdopted) return;
        const { adoptLegacyRows } = await import('../localDb/legacyAdopt');
        try {
            const n = await adoptLegacyRows(thingId);
            if (n > 0) console.log('[identity] Adopted', n, 'legacy rows to', thingId);
        } catch (e) {
            console.warn('identity: legacy row adoption failed', e);
        }
        registry.value.legacyAdopted = true;
        await persist();
    }

    function unsetUnlocked(thingId) {
        const next = new Map(unlockedMap.value);
        next.delete(thingId);
        unlockedMap.value = next;
    }

    function itemFor(thingId) {
        if (thingId) return items.value.find((i) => i.thingId === thingId) || null;
        return primaryItem.value;
    }

    async function storeAutoOpen(item, file, passphrase, enabled) {
        if (enabled) {
            try {
                const token = await buildAutoOpenToken(file, passphrase);
                item.autoOpen = { enabled: true, token };
            } catch (e) {
                item.autoOpen = { enabled: false, token: null };
            }
        } else {
            item.autoOpen = { enabled: false, token: null };
        }
    }

    /**
     * Auto-open every convenience identity (requirePassphraseOnOpen OFF and a
     * stored token). Runs after restore so reopening the app "just works".
     */
    async function unlockAllAuto() {
        let changed = false;
        for (const item of items.value) {
            if (item.requirePassphraseOnOpen) continue;
            if (!item.autoOpen?.enabled || !item.autoOpen.token) continue;
            if (unlockedMap.value.has(item.thingId)) continue;
            try {
                const opened = await openIdentityFileWithToken(item.file, item.autoOpen.token);
                setUnlocked(opened);
            } catch (e) {
                // Token unusable (e.g. file replaced) — drop it, user unlocks manually.
                item.autoOpen = { enabled: false, token: null };
                changed = true;
            }
        }
        if (changed) await persist();
        await refreshSession();
    }

    // ── High-level actions ───────────────────────────────────────────
    /**
     * Create a fresh identity, add it to the registry, unlock it.
     * @returns {Promise<string>} the BIP-39 mnemonic (shown once to the user)
     */
    async function createAndSave({ thingId, name, passphrase, createdBy, requirePassphraseOnOpen = false }) {
        await restore();
        const { mnemonic, file } = await createIdentity({
            thingId, name, passphrase, createdBy,
        });
        const opened = await openIdentityFile(file, passphrase);
        // The FIRST identity on the device becomes primary; later ones do not
        // steal the role (the user can change it in the identity manager).
        const makePrimary = !registry.value.primaryThingId;
        await addItemFromOpened(opened, { passphrase, requirePassphraseOnOpen, makePrimary });
        return mnemonic;
    }

    /** Adopt an identity from an imported file, unlock it, make it primary. */
    async function adoptFile(file, passphrase, { requirePassphraseOnOpen = false } = {}) {
        await restore();
        const opened = await openIdentityFile(file, passphrase);
        await addItemFromOpened(opened, { passphrase, requirePassphraseOnOpen, makePrimary: true });
        return opened;
    }

    async function addItemFromOpened(opened, { passphrase, requirePassphraseOnOpen, makePrimary }) {
        const thingId = opened.thingId;
        const idx = items.value.findIndex((i) => i.thingId === thingId);
        let item;
        if (idx >= 0) {
            item = items.value[idx];
            if (unlockedMap.value.has(thingId)) {
                throw new Error('This identity is already unlocked on this device.');
            }
            // Same identity re-imported → adopt the newest file but keep the
            // existing passphrase preference.
            item.file = opened.file;
            item.name = opened.name;
            item.publicKey = opened.file.public_key;
        } else {
            item = makeItem(opened.file);
            items.value.push(item);
        }
        item.requirePassphraseOnOpen = !!requirePassphraseOnOpen;
        await storeAutoOpen(item, opened.file, passphrase, !requirePassphraseOnOpen);
        registry.value.guestMode = false;
        if (makePrimary || !registry.value.primaryThingId) {
            registry.value.primaryThingId = thingId;
        }
        setUnlocked(opened);
        await adoptLegacyOnFirstUnlock(thingId);
        await persist();
        await refreshSession();
        return opened;
    }

    /**
     * Unlock a stored identity with its passphrase.
     * @param {string} [thingId] - defaults to the primary item
     * @param {string} passphrase
     * @param {object} [opts]
     * @param {boolean} [opts.rememberDevice] - store the auto-open token.
     *        Defaults to `!item.requirePassphraseOnOpen`.
     */
    async function unlock(thingId, passphrase, opts = {}) {
        await restore();
        const item = itemFor(thingId);
        if (!item) throw new Error('No identity file stored.');
        const opened = await openIdentityFile(item.file, passphrase);
        const remember = opts.rememberDevice ?? !item.requirePassphraseOnOpen;
        await storeAutoOpen(item, opened.file, passphrase, remember);
        item.name = opened.name;
        setUnlocked(opened);
        await adoptLegacyOnFirstUnlock(item.thingId);
        await persist();
        await refreshSession();
        return opened;
    }

    /** Lock one identity (default: the current primary). Keys leave memory. */
    async function lock(thingId) {
        const item = itemFor(thingId);
        if (item && unlockedMap.value.has(item.thingId)) {
            unsetUnlocked(item.thingId);
            await refreshSession();
        }
    }

    /** Lock every identity on the device (keys leave memory, files stay). */
    async function lockAll() {
        if (unlockedMap.value.size === 0) return;
        unlockedMap.value = new Map();
        await refreshSession();
    }

    /** Set the primary identity (the owner of newly created objects). */
    async function setPrimary(thingId) {
        await restore();
        if (!items.value.some((i) => i.thingId === thingId)) {
            throw new Error('Unknown identity.');
        }
        registry.value.primaryThingId = thingId;
        await persist();
        await refreshSession();
    }

    /**
     * Toggle per-identity "require passphrase when the app opens".
     * Turning it ON deletes the stored auto-open token, so the next open asks.
     */
    async function setRequirePassphraseOnOpen(thingId, on) {
        await restore();
        const item = itemFor(thingId);
        if (!item) throw new Error('Unknown identity.');
        item.requirePassphraseOnOpen = !!on;
        if (on) {
            item.autoOpen = { enabled: false, token: null };
        }
        await persist();
    }

    /**
     * Remove an identity from the device.
     * @param {string} thingId
     * @param {object} [opts]
     * @param {boolean} [opts.wipeData] - also delete this identity's local rows
     */
    async function removeIdentity(thingId, { wipeData = false } = {}) {
        await restore();
        const idx = items.value.findIndex((i) => i.thingId === thingId);
        if (idx < 0) return;
        items.value.splice(idx, 1);
        unsetUnlocked(thingId);
        if (registry.value.primaryThingId === thingId) {
            registry.value.primaryThingId = items.value[0]?.thingId ?? null;
        }
        if (wipeData) {
            const { wipeOwnerRows } = await import('../localDb/wipe');
            await wipeOwnerRows(thingId);
        }
        await persist();
        await refreshSession();
    }

    /** Mark the app as running in guest mode (no identity chosen yet). */
    async function enterGuest() {
        await restore();
        if (items.value.length > 0) {
            registry.value.guestMode = false; // cannot be a guest with identities stored
        } else {
            registry.value.guestMode = true;
        }
        await lockAll();
        await persist();
    }

    /**
     * Owners that should be visible right now, for the read filter.
     * @returns {Set<string>|null} null = filtering disabled (no identity ever
     *          stored — everything local is visible, matching pre-identity apps).
     */
    function currentVisibleOwners() {
        if (items.value.length === 0) return null;
        return new Set(unlockedMap.value.keys());
    }

    /**
     * Wipe every local trace: identities, imported data, preferences. The
     * caller should reload the app afterwards (fresh first-run state).
     */
    async function clearAllData() {
        await restore();
        unlockedMap.value = new Map();
        registry.value = blankRegistry();
        try {
            await storage.remove(REGISTRY_KEY);
            await storage.remove(LEGACY_KEY);
        } catch (e) {
            console.warn('identity: failed to remove storage keys', e);
        }
        try {
            const { getDb } = await import('../localDb/index');
            await getDb().delete();
        } catch (e) {
            console.warn('identity: failed to delete local database', e);
        }
        invalidateRestore();
    }

    return {
        // state
        registry,
        items,
        unlockedMap,
        unlockedSet,
        // derived (back-compat names included)
        unlocked,
        guestMode,
        primary,
        primaryItem,
        identity,
        identityFile,
        // actions
        restore,
        createAndSave,
        adoptFile,
        unlock,
        lock,
        lockAll,
        unlockAllAuto,
        setPrimary,
        setRequirePassphraseOnOpen,
        removeIdentity,
        enterGuest,
        currentVisibleOwners,
        clearAllData,
    };
});
