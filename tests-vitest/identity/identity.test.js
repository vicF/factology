// tests-vitest/identity/identity.test.js

import { describe, it, expect } from 'vitest';
import {
    createIdentity,
    openIdentityFile,
    generateMnemonic,
    entropyFromMnemonic,
    keypairFromMnemonic,
    generateKeypair,
    thingIdFromPublicKey,
    signBytes,
    verifyBytes,
    signJson,
    verifyJson,
    IDENTITY_FILE_TYPE,
    IDENTITY_FILE_VERSION,
} from '@/identity/identity';

const NAME = 'Victor Fokin';
const THING_ID = 'test-thing-id-0001';
const PASSPHRASE = 'correct horse battery staple';

describe('identity — keypair & mnemonic', () => {
    it('generates a fresh keypair', () => {
        const { secretKey, publicKey } = generateKeypair();
        expect(secretKey).toHaveLength(32);
        expect(publicKey).toHaveLength(32);
    });

    it('mnemonic encodes the secret key and re-derives the same keypair', async () => {
        const identity = await createIdentity({ thingId: THING_ID, name: NAME, passphrase: PASSPHRASE });
        const words = identity.mnemonic.split(' ');
        expect(words).toHaveLength(24);

        const restored = keypairFromMnemonic(identity.mnemonic);
        expect(Buffer.from(restored.secretKey)).toEqual(Buffer.from(identity.secretKey));
        expect(Buffer.from(restored.publicKey)).toEqual(Buffer.from(identity.publicKey));
    });

    it('rejects an invalid mnemonic', () => {
        expect(() => entropyFromMnemonic('abandon abandon abandon')).toThrow();
    });

    it('derives thing_id deterministically from the public key', () => {
        const a = generateKeypair();
        const b = generateKeypair();
        expect(thingIdFromPublicKey(a.publicKey)).toBe(thingIdFromPublicKey(a.publicKey));
        expect(thingIdFromPublicKey(a.publicKey)).not.toBe(thingIdFromPublicKey(b.publicKey));
    });
});

describe('identity — file roundtrip', () => {
    it('builds a well-formed identity file', async () => {
        const { file } = await createIdentity({ thingId: THING_ID, name: NAME, passphrase: PASSPHRASE });
        expect(file.type).toBe(IDENTITY_FILE_TYPE);
        expect(file.version).toBe(IDENTITY_FILE_VERSION);
        expect(file.thing_id).toBe(THING_ID);
        expect(file.name).toBe(NAME);
        expect(file.public_key).toBeTruthy();
        expect(file.private_key.iv).toBeTruthy();
        expect(file.private_key.data).toBeTruthy();
        expect(file.kdf.name).toBe('PBKDF2-SHA256');
        expect(file.kdf.salt).toBeTruthy();
        expect(typeof file.public_key).toBe('string');
        expect(file.private_key.data).not.toContain(file.public_key); // ciphertext, not plaintext
    });

    it('opens the file with the correct passphrase and restores the identity', async () => {
        const identity = await createIdentity({ thingId: THING_ID, name: NAME, passphrase: PASSPHRASE });
        const opened = await openIdentityFile(identity.file, PASSPHRASE);

        expect(opened.thingId).toBe(THING_ID);
        expect(opened.name).toBe(NAME);
        expect(Buffer.from(opened.publicKey)).toEqual(Buffer.from(identity.publicKey));
        expect(Buffer.from(opened.secretKey)).toEqual(Buffer.from(identity.secretKey));
    });

    it('rejects a wrong passphrase', async () => {
        const identity = await createIdentity({ thingId: THING_ID, name: NAME, passphrase: PASSPHRASE });
        await expect(openIdentityFile(identity.file, 'wrong-passphrase')).rejects.toThrow(/Wrong passphrase/);
    });

    it('rejects a tampered file (public key mismatch)', async () => {
        const identity = await createIdentity({ thingId: THING_ID, name: NAME, passphrase: PASSPHRASE });
        const other = generateKeypair();
        await expect(
            openIdentityFile({ ...identity.file, public_key: Buffer.from(other.publicKey).toString('base64url') }, PASSPHRASE),
        ).rejects.toThrow(/corrupt|keys do not match/i);
    });

    it('rejects a non-identity file', async () => {
        await expect(openIdentityFile({ type: 'something-else' }, PASSPHRASE)).rejects.toThrow(/Not a Factology identity/);
    });

    it('enforces a minimum passphrase length', async () => {
        await expect(
            createIdentity({ thingId: THING_ID, name: NAME, passphrase: 'short' }),
        ).rejects.toThrow(/at least 8/);
    });

    it('derives thing_id from the public key when no account thing_id is given', async () => {
        const identity = await createIdentity({ name: NAME, passphrase: PASSPHRASE });
        expect(identity.file.thing_id).toBe(thingIdFromPublicKey(identity.publicKey));
        expect(identity.file.thing_id).toBeTruthy();
    });
});

describe('identity — signing', () => {
    it('signs and verifies raw bytes', async () => {
        const identity = await createIdentity({ thingId: THING_ID, name: NAME, passphrase: PASSPHRASE });
        const msg = new TextEncoder().encode('factology payload');
        const sig = signBytes(msg, identity.secretKey);
        // public_key uses the module's base64url encoding (padded) — not Node's
        expect(verifyBytes(msg, identity.file.public_key, sig)).toBe(true);
        expect(verifyBytes(new TextEncoder().encode('tampered'), identity.file.public_key, sig)).toBe(false);
    });

    it('signs and verifies JSON payloads', async () => {
        const identity = await createIdentity({ thingId: THING_ID, name: NAME, passphrase: PASSPHRASE });
        const payload = { objects: [{ thing_id: 'a' }], exported_by: THING_ID };
        const sig = signJson(payload, identity.secretKey);
        expect(verifyJson(payload, identity.file.public_key, sig)).toBe(true);
        expect(verifyJson({ ...payload, objects: [] }, identity.file.public_key, sig)).toBe(false);
    });

    it('verifyBytes returns false (not throws) for garbage signatures', () => {
        expect(verifyBytes('x', 'a', 'b')).toBe(false);
    });
});
