// packages/engine/src/identity/identity.js
//
// Self-sovereign identity: Ed25519 keypair + BIP-39 mnemonic + a portable,
// passphrase-protected identity file. The same owner uuid (`thing_id`) can be
// adopted on any of the user's apps by importing the file.
//
// - Secret key = 32-byte Ed25519 seed. The BIP-39 mnemonic encodes that seed,
//   so the mnemonic alone re-derives the exact same keypair (keygen(seed)).
// - The identity file carries { thing_id, name, public_key } in cleartext and
//   the secret key encrypted (PBKDF2-SHA256 → AES-GCM) under a user passphrase.
// - Fresh identities derive thing_id from the public key (UUID v5), making the
//   owner field verifiable; account-adoption identities carry the account's
//   existing users.thing_id.

import { hashes, keygen, getPublicKey, sign, verify } from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { base64url } from '@scure/base';
import { v5 as uuidv5 } from 'uuid';

hashes.sha512 = sha512;

export const IDENTITY_FILE_TYPE = 'factology-identity';
export const IDENTITY_FILE_VERSION = 1;

// Fixed namespace for key-derived thing_ids (anything stable works).
const KEY_IDENTITY_NAMESPACE = 'd9f0a2c1-3e4b-4f6a-8c7d-0a1b2c3d4e5f';
const PBKDF2_ITERATIONS = 210000;
const MIN_PASSPHRASE_LENGTH = 8;

const te = new TextEncoder();
const b64e = (bytes) => base64url.encode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
const b64d = (str) => base64url.decode(str);
const asBytes = (value) => (value instanceof Uint8Array ? value : te.encode(value));

// ─── Mnemonic ────────────────────────────────────────────────────────────

/** Generate a BIP-39 mnemonic (24 words) from fresh random entropy. */
export function generateMnemonic(entropyBytes = 32) {
    const entropy = crypto.getRandomValues(new Uint8Array(entropyBytes));
    return bip39.entropyToMnemonic(entropy, wordlist);
}

/** Decode a BIP-39 mnemonic to its 32-byte entropy/seed (throws if invalid). */
export function entropyFromMnemonic(mnemonic) {
    return bip39.mnemonicToEntropy(mnemonic, wordlist);
}

/** Re-derive the exact keypair from a mnemonic. */
export function keypairFromMnemonic(mnemonic) {
    return keygen(entropyFromMnemonic(mnemonic));
}

// ─── Key helpers ─────────────────────────────────────────────────────────

/** Fresh random keypair. */
export function generateKeypair() {
    return keygen();
}

/** thing_id for a self-sovereign identity = UUID v5 of the public key. */
export function thingIdFromPublicKey(publicKeyBytes) {
    return uuidv5(publicKeyBytes, KEY_IDENTITY_NAMESPACE);
}

// ─── Passphrase protection (PBKDF2-SHA256 → AES-GCM) ─────────────────────

async function deriveEncryptionKey(passphrase, salt, iterations) {
    const material = await crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

async function encryptBytes(plain, passphrase, salt, iterations) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveEncryptionKey(passphrase, salt, iterations);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
    return { iv: b64e(iv), data: b64e(ciphertext) };
}

async function decryptBytes(encrypted, passphrase, salt, iterations) {
    const key = await deriveEncryptionKey(passphrase, salt, iterations);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(encrypted.iv) }, key, b64d(encrypted.data));
    return new Uint8Array(plain);
}

// ─── Identity file ───────────────────────────────────────────────────────

/**
 * Build the portable identity file.
 * @param {object} params
 * @param {string} params.thingId — owner uuid (account's users.thing_id, or key-derived)
 * @param {string} params.name — display name
 * @param {string} params.mnemonic — 24-word BIP-39 phrase encoding the secret key
 * @param {string} params.passphrase — protects the secret key in the file
 * @param {string} [params.createdBy] — app/platform that created the file
 */
export async function buildIdentityFile({ thingId, name, mnemonic, passphrase, createdBy }) {
    const { secretKey, publicKey } = keygen(entropyFromMnemonic(mnemonic));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const encrypted = await encryptBytes(secretKey, passphrase, salt, PBKDF2_ITERATIONS);
    return {
        type: IDENTITY_FILE_TYPE,
        version: IDENTITY_FILE_VERSION,
        thing_id: thingId,
        name,
        public_key: b64e(publicKey),
        private_key: encrypted,
        kdf: { name: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt: b64e(salt) },
        created_at: new Date().toISOString(),
        created_by: createdBy || 'unknown',
    };
}

/**
 * Create a new identity: random keypair + mnemonic + passphrase-protected file.
 * @returns {Promise<{ mnemonic: string, secretKey: Uint8Array, publicKey: Uint8Array, file: object }>}
 */
export async function createIdentity({ thingId, name, passphrase, createdBy }) {
    if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
    }
    const mnemonic = generateMnemonic();
    const { secretKey, publicKey } = keygen(entropyFromMnemonic(mnemonic));
    // No account bound (fresh self-sovereign identity) → derive the owner
    // uuid from the public key, so the owner field is verifiable.
    const resolvedThingId = thingId || thingIdFromPublicKey(publicKey);
    const file = await buildIdentityFile({ thingId: resolvedThingId, name, mnemonic, passphrase, createdBy });
    return { mnemonic, secretKey, publicKey, file };
}

/**
 * Open (unlock) an identity file with the passphrase. Verifies the decrypted
 * key against the file's public key. Returns the working identity in memory.
 * @returns {Promise<{ secretKey: Uint8Array, publicKey: Uint8Array, thingId: string, name: string, file: object }>}
 */
export async function openIdentityFile(file, passphrase) {
    if (!file || file.type !== IDENTITY_FILE_TYPE) {
        throw new Error('Not a Factology identity file.');
    }
    if (!passphrase) {
        throw new Error('Passphrase required.');
    }
    let secretKey;
    try {
        secretKey = await decryptBytes(file.private_key, passphrase, b64d(file.kdf.salt), file.kdf.iterations);
    } catch {
        throw new Error('Wrong passphrase or corrupt file.');
    }
    const publicKey = getPublicKey(secretKey);
    if (b64e(publicKey) !== file.public_key) {
        throw new Error('Identity file is corrupt: keys do not match.');
    }
    return { secretKey, publicKey, thingId: file.thing_id, name: file.name, file };
}

// ─── Auto-open token (device convenience) ────────────────────────────────
//
// When the user opts for "open freely on this device" (requirePassphraseOnOpen
// = false) the app stores a token that lets it decrypt the identity file
// WITHOUT re-asking the passphrase. The token is the raw file-decryption key
// (PBKDF2 output) — the passphrase itself is never persisted. Storing it means
// "trust this device": any attacker who can read device storage can already
// read the plaintext Dexie data, so the token adds no new exposure. Turning
// "require passphrase on open" ON deletes the token.

/**
 * Derive and export the file-decryption key so the file can later be opened
 * without the passphrase (auto-open convenience on this device).
 *
 * @returns {Promise<{ version: number, key: string }>} base64url key token
 */
export async function buildAutoOpenToken(file, passphrase) {
    const material = await crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: b64d(file.kdf.salt), iterations: file.kdf.iterations, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        true, // extractable — required to persist the token
        ['encrypt', 'decrypt'],
    );
    const raw = await crypto.subtle.exportKey('raw', key);
    return { version: 1, key: b64e(new Uint8Array(raw)) };
}

/**
 * Open an identity file using a stored auto-open token (no passphrase).
 * @returns {Promise<{ secretKey, publicKey, thingId, name, file }>}
 */
export async function openIdentityFileWithToken(file, token) {
    if (!token || !token.key) {
        throw new Error('No auto-open token stored for this identity.');
    }
    let secretKeyBytes;
    try {
        const key = await crypto.subtle.importKey('raw', b64d(token.key), 'AES-GCM', false, ['decrypt']);
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: b64d(file.private_key.iv) },
            key,
            b64d(file.private_key.data),
        );
        secretKeyBytes = new Uint8Array(plain);
    } catch {
        throw new Error('Auto-open token does not match the identity file.');
    }
    const publicKey = getPublicKey(secretKeyBytes);
    if (b64e(publicKey) !== file.public_key) {
        throw new Error('Auto-open token does not match the identity file.');
    }
    return { secretKey: secretKeyBytes, publicKey, thingId: file.thing_id, name: file.name, file };
}

// ─── Signing ─────────────────────────────────────────────────────────────

/** Sign raw bytes with the identity's secret key; returns base64url. */
export function signBytes(bytes, secretKey) {
    return b64e(sign(asBytes(bytes), secretKey));
}

/** Verify a base64url signature over raw bytes with a base64url public key. */
export function verifyBytes(bytes, publicKeyB64, signatureB64) {
    try {
        return verify(b64d(signatureB64), asBytes(bytes), b64d(publicKeyB64));
    } catch {
        return false;
    }
}

/** Sign a JSON payload (serialized deterministically by the caller). */
export function signJson(payload, secretKey) {
    return signBytes(te.encode(JSON.stringify(payload)), secretKey);
}

/** Verify a signature over a JSON payload. */
export function verifyJson(payload, publicKeyB64, signatureB64) {
    return verifyBytes(te.encode(JSON.stringify(payload)), publicKeyB64, signatureB64);
}

// ─── Recovery from the backup phrase ─────────────────────────────────────

/** True if `mnemonic` is a well-formed BIP-39 phrase from the English wordlist. */
export function isValidMnemonic(mnemonic) {
    if (typeof mnemonic !== 'string') return false;
    try {
        bip39.mnemonicToEntropy(mnemonic.trim(), wordlist);
        return true;
    } catch {
        return false;
    }
}

/**
 * Rebuild the identity FILE from the BIP-39 backup phrase (the only way back
 * if the original file is lost).
 *
 * The rebuilt file carries the same public key, so any server/app that had the
 * key bound still recognises it. The owner uuid defaults to the key-derived
 * one (self-sovereign identities); pass `thingId` explicitly when the original
 * identity was bound to an account (its uuid is not derivable from the key).
 *
 * @returns {Promise<{ file: object, publicKey: Uint8Array, secretKey: Uint8Array }>}
 */
export async function recoverIdentityFile({ mnemonic, name = 'Identity', passphrase, thingId = null, createdBy = 'recover' }) {
    if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
    }
    const phrase = String(mnemonic || '').trim();
    if (!isValidMnemonic(phrase)) {
        throw new Error('Invalid backup phrase — check the words and their order.');
    }
    const { secretKey, publicKey } = keypairFromMnemonic(phrase);
    const resolvedThingId = thingId || thingIdFromPublicKey(publicKey);
    const file = await buildIdentityFile({
        thingId: resolvedThingId,
        name,
        mnemonic: phrase,
        passphrase,
        createdBy,
    });
    return { file, secretKey, publicKey };
}
