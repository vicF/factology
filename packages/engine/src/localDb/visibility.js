// packages/engine/src/localDb/visibility.js
//
// Owner-visibility filter for the offline (Dexie) app.
//
// Visibility model (see docs/MULTI-INSTANCE-SYNC.md):
//   - Rows owned by UUID.SYSTEM_OWNER (seed/system rows) are shared — always
//     visible to guests and to every unlocked identity.
//   - A row owned by an identity is PRIVATE to that identity: it is visible
//     only while that identity is unlocked. The `public` flag does not grant
//     cross-identity visibility in offline mode (sharing is done by unlocking
//     the other identity on the same device today; access groups come later).
//   - Unowned rows (owner == null) are legacy rows created before ownership
//     existed; they stay visible until adopted by an identity
//     (localDb/legacyAdopt.js).
//   - `visibleOwners === null` disables the filter entirely (web/server mode,
//     or an offline app that has never stored an identity file).
//
// This module is pure (no imports of stores) so it is safe to use from the
// API handler, tests, and future sync/sharing code. The caller decides which
// owners are visible and passes the set in.

import { UUID } from '../constants/uuid.js';

/** Owners treated as shared system rows — visible to everyone. */
export const SYSTEM_SHARED_OWNERS = new Set([UUID.SYSTEM_OWNER]);

/**
 * Whether a row may be surfaced to the current UI session.
 *
 * @param {object|null} obj - an object row ({ thing_id, owner, public, ... })
 * @param {Set<string>|null} visibleOwners - thing_ids of unlocked identities;
 *        `null` disables filtering.
 * @returns {boolean}
 */
export function isRowVisible(obj, visibleOwners) {
    if (visibleOwners === null) return true;
    if (!obj || obj.owner == null) return true; // legacy unowned rows
    if (SYSTEM_SHARED_OWNERS.has(obj.owner)) return true;
    return visibleOwners.has(obj.owner);
}

/**
 * Filter rows to those visible to the given owner set.
 * @param {Array} rows
 * @param {Set<string>|null} visibleOwners
 * @returns {Array}
 */
export function filterVisible(rows, visibleOwners) {
    if (visibleOwners === null) return rows;
    return rows.filter((r) => isRowVisible(r, visibleOwners));
}

/**
 * Turn an array of unlocked thing_ids into a visible-owner set.
 * @param {string[]} thingIds
 * @returns {Set<string>}
 */
export function visibleOwnerSet(thingIds) {
    return new Set(thingIds);
}
