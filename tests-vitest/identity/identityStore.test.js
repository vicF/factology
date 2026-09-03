// tests-vitest/identity/identityStore.test.js
//
// Registry store lifecycle: create/import multiple identities, unlock/lock,
// primary ownership, per-identity passphrase-on-open, guest mode, legacy
// migration, and the auto-open token round trip.

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useIdentityStore } from '@/stores/identity';
import { createIdentity, buildAutoOpenToken, openIdentityFileWithToken } from '@/identity/identity';

const PW = 'test-passphrase-123';

function freshStore() {
    setActivePinia(createPinia());
    return useIdentityStore();
}

describe('identity store — registry lifecycle', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('create adds one registry item, unlocks it, makes it primary, stores an auto-open token', async () => {
        const store = freshStore();
        await store.createAndSave({ name: 'Alice', passphrase: PW });

        expect(store.items.length).toBe(1);
        expect(store.unlocked).toBe(true);
        expect(store.primary).toBeTruthy();
        expect(store.guestMode).toBe(false);

        const item = store.items[0];
        expect(item.requirePassphraseOnOpen).toBe(false);
        expect(item.autoOpen.enabled).toBe(true);
        expect(item.autoOpen.token.key).toBeTruthy();
    });

    it('two identities coexist on the device; the first stays primary until changed', async () => {
        const store = freshStore();
        await store.createAndSave({ name: 'A', passphrase: PW });
        await store.createAndSave({ name: 'B', passphrase: PW });

        expect(store.items.length).toBe(2);
        expect(store.unlockedSet.size).toBe(2);

        const a = store.items.find((i) => i.name === 'A');
        const b = store.items.find((i) => i.name === 'B');
        expect(a && b).toBeTruthy();
        expect(store.primaryItem.thingId).toBe(a.thingId);

        await store.setPrimary(b.thingId);
        expect(store.primaryItem.thingId).toBe(b.thingId);
    });

    it('lock clears keys from memory; a convenience identity reopens via its token', async () => {
        const store = freshStore();
        await store.createAndSave({ name: 'A', passphrase: PW });
        const item = store.items[0];

        await store.lock(item.thingId);
        expect(store.unlocked).toBe(false);

        await store.unlockAllAuto(); // simulates app reopen on this device
        expect(store.unlocked).toBe(true);
        expect(store.primary.thingId).toBe(item.thingId);
    });

    it('passphrase-on-open identities do not auto-open and keep no token', async () => {
        const store = freshStore();
        await store.createAndSave({ name: 'A', passphrase: PW, requirePassphraseOnOpen: true });
        const item = store.items[0];

        expect(item.requirePassphraseOnOpen).toBe(true);
        expect(item.autoOpen.enabled).toBe(false);

        await store.lock(item.thingId);
        await store.unlockAllAuto();
        expect(store.unlocked).toBe(false); // must stay locked at "reopen"

        await store.unlock(item.thingId, PW);
        expect(store.unlocked).toBe(true);
        expect(item.autoOpen.enabled).toBe(false); // token not re-stored
    });

    it('guest flag persists, and creating an identity exits guest mode', async () => {
        const store = freshStore();
        await store.enterGuest();
        expect(store.guestMode).toBe(true);
        expect(store.items.length).toBe(0);

        const reloaded = freshStore();
        await reloaded.restore();
        expect(reloaded.guestMode).toBe(true);

        await reloaded.createAndSave({ name: 'Alice', passphrase: PW });
        expect(reloaded.guestMode).toBe(false);
        expect(reloaded.items.length).toBe(1);
    });

    it('migrates the legacy single identity file into the registry', async () => {
        const { file } = await createIdentity({ name: 'Legacy', passphrase: PW });
        localStorage.setItem('factology_identity_file', JSON.stringify(file));

        const store = freshStore();
        await store.restore();

        expect(store.items.length).toBe(1);
        expect(store.primaryItem.thingId).toBe(file.thing_id);
        expect(localStorage.getItem('factology_identity_file')).toBeNull();
        expect(localStorage.getItem('factology_identity_registry')).toBeTruthy();
    });

    it('removing an identity drops it and re-homes the primary', async () => {
        const store = freshStore();
        await store.createAndSave({ name: 'A', passphrase: PW });
        await store.createAndSave({ name: 'B', passphrase: PW });
        const a = store.items.find((i) => i.name === 'A');
        const b = store.items.find((i) => i.name === 'B');

        await store.setPrimary(b.thingId);
        await store.removeIdentity(a.thingId);

        expect(store.items.length).toBe(1);
        expect(store.items[0].thingId).toBe(b.thingId);
        expect(store.primaryItem.thingId).toBe(b.thingId);
        expect(store.unlockedSet.has(a.thingId)).toBe(false);
    });
});

describe('auto-open token round trip', () => {
    it('opens the file without the passphrase; a wrong token is rejected', async () => {
        const identity = await createIdentity({ name: 'X', passphrase: PW });

        const token = await buildAutoOpenToken(identity.file, PW);
        const opened = await openIdentityFileWithToken(identity.file, token);

        expect(opened.thingId).toBe(identity.file.thing_id);
        expect(opened.name).toBe('X');

        await expect(
            openIdentityFileWithToken(identity.file, { version: 1, key: 'AAAA' }),
        ).rejects.toThrow(/does not match/);
    });
});
