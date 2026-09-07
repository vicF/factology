// tests-vitest/identity/shamir.test.js

import { describe, it, expect } from 'vitest';
import {
    splitSecret,
    combineShares,
    splitSecretString,
    combineSharesToString,
    serializeShare,
    parseShare,
} from '@/identity/shamir';

const te = new TextEncoder();

function bytes(s) {
    return te.encode(s);
}

describe('shamir — split/combine', () => {
    it('round-trips a secret with the minimum threshold (2 of 3)', () => {
        const secret = bytes('the-quick-brown-fox-jumps');
        const shares = splitSecret(secret, 3, 2);

        const recovered = combineShares([shares[0], shares[2]]);
        expect(Buffer.from(recovered)).toEqual(Buffer.from(secret));
    });

    it('reconstructs from ANY threshold subset (3 of 5)', () => {
        const secret = bytes('1234567890abcdef');
        const shares = splitSecret(secret, 5, 3);

        for (const idx of [[0, 2, 4], [1, 3, 4], [0, 1, 3]]) {
            const recovered = combineShares(idx.map((i) => shares[i]));
            expect(Buffer.from(recovered)).toEqual(Buffer.from(secret));
        }
    });

    it('also reconstructs when more than the threshold shares are given', () => {
        const secret = bytes('extra-shares-fine');
        const shares = splitSecret(secret, 5, 2);
        const recovered = combineShares(shares); // all 5
        expect(Buffer.from(recovered)).toEqual(Buffer.from(secret));
    });

    it('fails when fewer than the threshold shares are given', () => {
        const secret = bytes('needs-three');
        const shares = splitSecret(secret, 5, 3);
        expect(() => combineShares([shares[0], shares[1]])).toThrow(/at least 3 shares/);
    });

    it('rejects duplicate share indices', () => {
        const secret = bytes('no-dupes');
        const shares = splitSecret(secret, 3, 2);
        expect(() => combineShares([shares[0], shares[0]])).toThrow(/Duplicate share index/);
    });

    it('rejects invalid split parameters', () => {
        const secret = bytes('x');
        expect(() => splitSecret(secret, 1, 1)).toThrow(/Invalid split parameters/);
        expect(() => splitSecret(secret, 5, 6)).toThrow(/Invalid split parameters/);
        expect(() => splitSecret(new Uint8Array(0), 3, 2)).toThrow(/non-empty/);
    });

    it('string helpers round-trip a BIP-39 backup phrase', () => {
        const phrase = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
        const shares = splitSecretString(phrase, 4, 3);
        expect(shares).toHaveLength(4);

        const recovered = combineSharesToString([shares[0], shares[2], shares[3]]);
        expect(recovered).toBe(phrase);
    });
});

describe('shamir — portable share payloads', () => {
    it('serialize/parse round-trip a share', () => {
        const shares = splitSecret(bytes('payload-test'), 3, 2);
        const text = serializeShare(shares[1]);
        expect(typeof text).toBe('string');

        const parsed = parseShare(text);
        expect(parsed.x).toBe(shares[1].x);
        expect(parsed.y).toBe(shares[1].y);
    });

    it('parsed shares still combine to the original secret', () => {
        const secret = bytes('portable-shares-work');
        const shares = splitSecret(secret, 3, 2).map(serializeShare).map(parseShare);
        const recovered = combineShares(shares);
        expect(Buffer.from(recovered)).toEqual(Buffer.from(secret));
    });

    it('rejects non-share text', () => {
        expect(() => parseShare('{"type":"something-else"}')).toThrow(/Not a valid share/);
        expect(() => parseShare('banana')).toThrow(/Not a valid share/);
    });
});
