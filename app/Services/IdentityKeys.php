<?php

namespace App\Services;

/**
 * Ed25519 helpers for the server-side identity-file login.
 *
 * Keys and signatures arrive base64url-encoded without padding, matching the
 * JS client (resources/js/identity/identity.js, @noble/ed25519 + @scure/base).
 * Verification uses PHP's libsodium extension.
 */
class IdentityKeys
{
    /**
     * Decode a base64url Ed25519 public key to raw bytes, or null if malformed.
     */
    public static function decodePublicKey(?string $key): ?string
    {
        if (!is_string($key) || $key === '') {
            return null;
        }
        try {
            $bin = sodium_base642bin($key, SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);
        } catch (\Throwable) {
            return null;
        }
        if (strlen($bin) !== SODIUM_CRYPTO_SIGN_PUBLICKEYBYTES) {
            return null;
        }
        return $bin;
    }

    /**
     * Encode raw Ed25519 public-key bytes as base64url (no padding).
     */
    public static function encodePublicKey(string $raw): string
    {
        return sodium_bin2base64($raw, SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);
    }

    /**
     * Verify an Ed25519 signature (base64url, no padding) over $message with
     * the given public key (base64url, no padding). Returns false on any
     * malformed input rather than throwing.
     */
    public static function verifySignature(string $message, ?string $publicKey, ?string $signature): bool
    {
        $pub = self::decodePublicKey($publicKey);
        if ($pub === null || !is_string($signature) || $signature === '') {
            return false;
        }
        try {
            $sig = sodium_base642bin($signature, SODIUM_BASE64_VARIANT_URLSAFE_NO_PADDING);
        } catch (\Throwable) {
            return false;
        }
        if (strlen($sig) !== SODIUM_CRYPTO_SIGN_BYTES) {
            return false;
        }
        return sodium_crypto_sign_verify_detached($sig, $message, $pub);
    }

    /**
     * Fresh random challenge string (64 hex characters). The client signs the
     * exact UTF-8 bytes of this string.
     */
    public static function makeChallenge(): string
    {
        return bin2hex(random_bytes(32));
    }
}
