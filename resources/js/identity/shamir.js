// resources/js/identity/shamir.js
//
// Shamir's Secret Sharing over GF(2^8).
//
// Split a secret (e.g. a BIP-39 backup phrase) into N shares so that any K of
// them reconstruct the original, while fewer than K reveal nothing about it.
// This powers "social backup": hand one share to each of several trusted
// people/places; you can recover your identity with any K of them even if your
// own copies are lost or stolen.
//
// Shares are carried as small JSON blobs (base64url payload) that a friend can
// store in a notes app / file and return to you later.

import { base64url } from '@scure/base';

// ─── GF(2^8) arithmetic (poly 0x11b) ──────────────────────────────────────

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initTables() {
    // Generator is 3 (0x03), not 2: x = 2 has multiplicative order 51 under
    // 0x11b, so it never reaches all 255 non-zero elements. Walking powers of
    // 3 (a primitive element) fills the log table completely.
    let v = 1;
    for (let i = 0; i < 255; i += 1) {
        EXP[i] = v;
        LOG[v] = i;
        const t = v << 1;
        v = (t & 0x100 ? t ^ 0x11b : t) ^ v; // v * 3 in GF(2^8)
    }
    for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

function gmul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
}

function ginv(a) {
    if (a === 0) throw new Error('Cannot invert zero in GF(2^8).');
    return EXP[255 - LOG[a]];
}

// Evaluate the polynomial whose coefficients are `coeffs` (lowest degree
// first) at x over the field. Horner's method.
function evalPoly(coeffs, x) {
    let acc = 0;
    for (let i = coeffs.length - 1; i >= 0; i -= 1) {
        acc = gmul(acc, x) ^ coeffs[i];
    }
    return acc;
}

const te = new TextEncoder();
const td = new TextDecoder();
const b64e = (bytes) => base64url.encode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
const b64d = (str) => base64url.decode(str);

// ─── Split / combine ───────────────────────────────────────────────────────

export const SHARE_TYPE = 'factology-shamir-share';
export const SHARE_VERSION = 1;
export const MAX_SHARES = 255;

/**
 * Split `secret` (arbitrary bytes) into `total` shares; any `threshold` of
 * them reconstruct it. Coeffs come from a CSPRNG.
 *
 * @returns {Array<{ n: number, k: number, x: number, y: string }>}
 */
export function splitSecret(secret, total, threshold) {
    // ArrayBuffer.isView instead of instanceof: typed arrays can come from a
    // different realm (jsdom vs node), where instanceof fails.
    if (!ArrayBuffer.isView(secret) || secret.byteLength === 0) {
        throw new Error('Secret must be a non-empty Uint8Array.');
    }
    if (!Number.isInteger(total) || !Number.isInteger(threshold)
        || total < 2 || threshold < 2 || threshold > total || total > MAX_SHARES) {
        throw new Error(`Invalid split parameters: need 2 <= threshold <= total <= ${MAX_SHARES}.`);
    }

    const shares = new Array(total);
    for (let s = 0; s < total; s += 1) {
        shares[s] = { n: total, k: threshold, x: s + 1, y: new Uint8Array(secret.length) };
    }

    for (let i = 0; i < secret.length; i += 1) {
        // Polynomial: coeff[0] = secret byte; coeff[1..k-1] random.
        const coeffs = new Uint8Array(threshold);
        coeffs[0] = secret[i];
        crypto.getRandomValues(coeffs.subarray(1));
        for (let s = 0; s < total; s += 1) {
            shares[s].y[i] = evalPoly(coeffs, shares[s].x);
        }
    }

    return shares.map((sh) => ({ n: sh.n, k: sh.k, x: sh.x, y: b64e(sh.y) }));
}

/**
 * Reconstruct the secret from K (or more) shares with distinct x values.
 * @param {Array<{ n: number, k: number, x: number, y: string }>} shares
 * @returns {Uint8Array}
 */
export function combineShares(shares) {
    if (!Array.isArray(shares) || shares.length < 2) {
        throw new Error('Need at least two shares.');
    }
    const parsed = shares.map((s) => {
        const x = Number(s.x);
        if (!Number.isInteger(x) || x < 1 || x > MAX_SHARES) {
            throw new Error(`Invalid share index ${s.x}.`);
        }
        return { n: Number(s.n), k: Number(s.k), x, y: b64d(s.y) };
    });

    const xs = parsed.map((s) => s.x);
    if (new Set(xs).size !== xs.length) {
        throw new Error('Duplicate share index — are you sure these are different shares?');
    }
    const k = parsed[0].k;
    if (parsed.length < k) {
        throw new Error(`Need at least ${k} shares to recover; only ${parsed.length} provided.`);
    }

    const width = parsed[0].y.length;
    for (const s of parsed) {
        if (s.y.length !== width) {
            throw new Error('Shares do not belong to the same secret.');
        }
    }

    // Lagrange interpolation at x=0: for each byte, secret =
    // sum_j y_j * product_{m!=j} x_m / (x_m + x_j).
    const result = new Uint8Array(width);
    for (let j = 0; j < parsed.length; j += 1) {
        let basis = 1; // L_j(0) in the field
        for (let m = 0; m < parsed.length; m += 1) {
            if (m === j) continue;
            basis = gmul(basis, gmul(parsed[m].x, ginv(parsed[j].x ^ parsed[m].x)));
        }
        for (let i = 0; i < width; i += 1) {
            result[i] ^= gmul(parsed[j].y[i], basis);
        }
    }
    return result;
}

// ─── String helpers (for BIP-39 phrases) ──────────────────────────────────

/** Split a UTF-8 string (e.g. a backup phrase) into N-of-K text shares. */
export function splitSecretString(secretText, total, threshold) {
    return splitSecret(te.encode(secretText), total, threshold);
}

/** Reconstruct a UTF-8 string from K (or more) shares. */
export function combineSharesToString(shares) {
    return td.decode(combineShares(shares));
}

// ─── Portable share payloads ───────────────────────────────────────────────

/**
 * Serialise one share to a JSON string a friend can keep. Contains n/k/x and
 * the base64url share bytes; the payload itself reveals nothing about the
 * secret unless enough shares are combined.
 */
export function serializeShare(share) {
    return JSON.stringify({
        type: SHARE_TYPE,
        version: SHARE_VERSION,
        n: share.n,
        k: share.k,
        x: share.x,
        y: share.y,
    });
}

/** Parse a share back from its serialised form. */
export function parseShare(text) {
    let obj;
    try {
        obj = JSON.parse(text);
    } catch {
        throw new Error('Not a valid share text.');
    }
    if (!obj || obj.type !== SHARE_TYPE) {
        throw new Error('Not a valid share text.');
    }
    if (typeof obj.x !== 'number' || typeof obj.y !== 'string') {
        throw new Error('Malformed share payload.');
    }
    return { n: obj.n, k: obj.k, x: obj.x, y: obj.y };
}
