// tests-vitest/identity/recover.test.js

import { describe, it, expect } from 'vitest';
import {
    createIdentity,
    openIdentityFile,
    generateMnemonic,
    recoverIdentityFile,
    isValidMnemonic,
    keypairFromMnemonic,
    thingIdFromPublicKey,
} from '@factology/engine/identity/identity.js';

const NAME = 'Victor Fokin';
const PASSPHRASE = 'correct horse battery staple';

describe('identity — recovery from the backup phrase', () => {
    it('validates mnemonic phrases', () => {
        const phrase = generateMnemonic();
        expect(isValidMnemonic(phrase)).toBe(true);
        expect(isValidMnemonic('banana tomato')).toBe(false);
        expect(isValidMnemonic('')).toBe(false);
        expect(isValidMnemonic(null)).toBe(false);
    });

    it('rejects an invalid backup phrase', async () => {
        await expect(recoverIdentityFile({
            mnemonic: 'not a real backup phrase at all',
            name: NAME,
            passphrase: PASSPHRASE,
        })).rejects.toThrow(/Invalid backup phrase/);
    });

    it('requires a passphrase of at least 8 characters', async () => {
        const phrase = generateMnemonic();
        await expect(recoverIdentityFile({
            mnemonic: phrase,
            name: NAME,
            passphrase: 'short',
        })).rejects.toThrow(/at least 8 characters/);
    });

    it('rebuilds a file with the same key and public_key from the mnemonic', async () => {
        const created = await createIdentity({ thingId: null, name: NAME, passphrase: PASSPHRASE });
        expect(created.mnemonic.split(' ')).toHaveLength(24);

        const { file } = await recoverIdentityFile({
            mnemonic: created.mnemonic,
            name: NAME,
            passphrase: PASSPHRASE,
        });

        const opened = await openIdentityFile(file, PASSPHRASE);
        expect(Buffer.from(opened.secretKey)).toEqual(Buffer.from(created.secretKey));
        expect(opened.file.public_key).toBe(created.file.public_key);

        // The restored key matches the phrase regardless of the file round-trip.
        const direct = keypairFromMnemonic(created.mnemonic);
        expect(Buffer.from(direct.publicKey)).toEqual(Buffer.from(created.publicKey));
    });

    it('derives the key-based thing_id when no account thing_id is given', async () => {
        const created = await createIdentity({ thingId: null, name: NAME, passphrase: PASSPHRASE });

        const { file } = await recoverIdentityFile({
            mnemonic: created.mnemonic,
            name: NAME,
            passphrase: PASSPHRASE,
        });
        expect(file.thing_id).toBe(thingIdFromPublicKey(keypairFromMnemonic(created.mnemonic).publicKey));
    });

    it('keeps an explicitly provided (account) thing_id', async () => {
        const accountThingId = '11111111-2222-4333-8444-555555555555';
        const created = await createIdentity({ thingId: accountThingId, name: NAME, passphrase: PASSPHRASE });

        const { file } = await recoverIdentityFile({
            mnemonic: created.mnemonic,
            name: NAME,
            passphrase: PASSPHRASE,
            thingId: accountThingId,
        });
        expect(file.thing_id).toBe(accountThingId);
    });
});
