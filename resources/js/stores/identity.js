// resources/js/stores/identity.js
//
// Self-sovereign identity store. Persists the (encrypted) identity file and
// keeps the unlocked keys in memory for the session. The passphrase is asked
// on create/import and on unlock after an app restart (key material is never
// persisted in the clear).

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { storage } from '../utils/storage';
import {
    createIdentity,
    openIdentityFile,
} from '../identity/identity';

const STORAGE_KEY = 'factology_identity_file';

export const useIdentityStore = defineStore('identity', () => {
    const identityFile = ref(null); // encrypted file, persisted
    const identity = ref(null);     // unlocked in-memory { thingId, name, secretKey, publicKey, file }
    const unlocked = ref(false);

    /** Load the stored identity file on app start. */
    async function restore() {
        try {
            const raw = await storage.get(STORAGE_KEY);
            if (raw) {
                identityFile.value = JSON.parse(raw);
            }
        } catch (error) {
            console.warn('identity: failed to restore identity file', error);
        }
        return !!identityFile.value;
    }

    async function persistFile(file) {
        identityFile.value = file;
        await storage.set(STORAGE_KEY, JSON.stringify(file));
    }

    /**
     * In offline (mobile/Electron) apps the identity IS the user session:
     * establishing it also logs the app in as that person (so the whole UI —
     * edit mode, profile, object creation — treats them as an owner). A real
     * server account that already resolves to the same thing_id is left alone.
     */
    async function establishSession({ thingId, name }) {
        const { useAuthStore } = await import('../stores/auth');
        const authStore = useAuthStore();
        if (authStore.user?.thing_id !== thingId) {
            await authStore.login(
                { id: thingId, thing_id: thingId, name, is_admin: false },
                `identity-${thingId}`,
            );
        }
    }

    async function setUnlocked(opened) {
        identity.value = opened;
        unlocked.value = true;
        await establishSession(opened);
    }

    /**
     * Create a fresh identity, persist the file, and unlock it.
     * @returns {Promise<string>} the BIP-39 mnemonic (shown once to the user)
     */
    async function createAndSave({ thingId, name, passphrase, createdBy }) {
        const { mnemonic, secretKey, publicKey, file } = await createIdentity({
            thingId, name, passphrase, createdBy,
        });
        await persistFile(file);
        // file.thing_id is authoritative (resolved from the key when no
        // account thing_id was passed).
        setUnlocked({ thingId: file.thing_id, name, secretKey, publicKey, file });
        return mnemonic;
    }

    /** Adopt an identity from an imported file. */
    async function adoptFile(file, passphrase) {
        const opened = await openIdentityFile(file, passphrase);
        await persistFile(file);
        setUnlocked(opened);
        return opened;
    }

    /** Unlock the stored identity file (e.g. after an app restart). */
    async function unlock(passphrase) {
        if (!identityFile.value) {
            throw new Error('No identity file stored.');
        }
        const opened = await openIdentityFile(identityFile.value, passphrase);
        setUnlocked(opened);
        return opened;
    }

    function lock() {
        identity.value = null;
        unlocked.value = false;
    }

    return {
        identityFile,
        identity,
        unlocked,
        restore,
        createAndSave,
        adoptFile,
        unlock,
        lock,
    };
});
