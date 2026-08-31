// resources/js/identity/identity.js
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
    const file = await buildIdentityFile({ thingId, name, mnemonic, passphrase, createdBy });
    const { secretKey, publicKey } = keygen(entropyFromMnemonic(mnemonic));
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
