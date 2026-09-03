// tests-vitest/localDb/visibility.test.js

import { describe, it, expect } from 'vitest';
import {
    isRowVisible,
    filterVisible,
    visibleOwnerSet,
    SYSTEM_SHARED_OWNERS,
} from '@/localDb/visibility';
import { UUID } from '@/constants/uuid';

const ID_A = 'identity-A';
const ID_B = 'identity-B';

const row = (over = {}) => ({ thing_id: 'x-1', name: 'X', owner: ID_A, public: 1, ...over });

describe('owner visibility — isRowVisible', () => {
    it('filter disabled (null) → everything visible', () => {
        expect(isRowVisible(row({ owner: 'someone-else' }), null)).toBe(true);
        expect(isRowVisible(null, null)).toBe(true);
    });

    it('system-shared rows are visible to everyone, even with an empty set', () => {
        const empty = visibleOwnerSet([]);
        expect(isRowVisible(row({ owner: UUID.SYSTEM_OWNER }), empty)).toBe(true);
        expect(isRowVisible(row({ owner: UUID.SYSTEM_OWNER }), visibleOwnerSet([ID_A]))).toBe(true);
        expect(SYSTEM_SHARED_OWNERS.has(UUID.SYSTEM_OWNER)).toBe(true);
    });

    it('VICTOR_FOKIN is an ordinary owner, not system-shared', () => {
        const empty = visibleOwnerSet([]);
        expect(SYSTEM_SHARED_OWNERS.has(UUID.VICTOR_FOKIN)).toBe(false);
        expect(isRowVisible(row({ owner: UUID.VICTOR_FOKIN }), empty)).toBe(false);
        expect(isRowVisible(row({ owner: UUID.VICTOR_FOKIN }), visibleOwnerSet([UUID.VICTOR_FOKIN]))).toBe(true);
    });

    it('an unlocked identity sees its own rows', () => {
        const setA = visibleOwnerSet([ID_A]);
        expect(isRowVisible(row({ owner: ID_A }), setA)).toBe(true);
        expect(isRowVisible(row({ owner: ID_B }), setA)).toBe(false);
    });

    it('a union sees every unlocked owner’s rows', () => {
        const both = visibleOwnerSet([ID_A, ID_B]);
        expect(isRowVisible(row({ owner: ID_A }), both)).toBe(true);
        expect(isRowVisible(row({ owner: ID_B }), both)).toBe(true);
        expect(isRowVisible(row({ owner: 'locked-out' }), both)).toBe(false);
    });

    it('an empty set (identity stored but locked) hides ordinary owners', () => {
        expect(isRowVisible(row({ owner: ID_A }), visibleOwnerSet([]))).toBe(false);
    });

    it('public flag does NOT grant cross-identity visibility offline', () => {
        const setA = visibleOwnerSet([ID_A]);
        expect(isRowVisible(row({ owner: ID_B, public: 1 }), setA)).toBe(false);
    });

    it('legacy unowned rows stay visible', () => {
        expect(isRowVisible(row({ owner: null }), visibleOwnerSet([]))).toBe(true);
        expect(isRowVisible(row({ owner: undefined }), visibleOwnerSet([]))).toBe(true);
    });
});

describe('owner visibility — filterVisible', () => {
    it('keeps only visible rows', () => {
        const rows = [
            row({ thing_id: 'a', owner: ID_A }),
            row({ thing_id: 'b', owner: ID_B }),
            row({ thing_id: 'sys', owner: UUID.SYSTEM_OWNER }),
        ];
        const out = filterVisible(rows, visibleOwnerSet([ID_A]));
        expect(out.map((r) => r.thing_id)).toEqual(['a', 'sys']);
    });

    it('returns rows unchanged when filtering is disabled', () => {
        const rows = [row({ owner: ID_B })];
        expect(filterVisible(rows, null)).toBe(rows);
    });
});
