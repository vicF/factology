import { storageSync } from '../utils/storage';

const STORAGE_KEY = 'factology:classTree:nodeState';
// Nodes at depth >= 1 start collapsed → 2 levels visible by default
export const COLLAPSE_FROM_DEPTH = 1;

// Module-level cache. Loaded once from storage; persists for the module's
// lifetime so the tree survives component remounts (e.g. mobile ↔ desktop
// branch swap on rotation) even when storageSync is a no-op on native.
let nodeState = null;

function load() {
    if (nodeState === null) {
        try {
            nodeState = JSON.parse(storageSync.get(STORAGE_KEY) || '{}');
        } catch {
            nodeState = {};
        }
    }
    return nodeState;
}
function save(map) {
    nodeState = map;
    storageSync.set(STORAGE_KEY, JSON.stringify(map));
}

// Test-only: drop the cached map so a fresh load re-reads storage.
export function _resetCache() {
    nodeState = null;
}

// Default: only depth 0 (level 1) is expanded; everything deeper is collapsed
export const defaultIsOpen = (depth) => depth < COLLAPSE_FROM_DEPTH;

export function useTreeState() {
    return {
        isOpen(id, depth) {
            const override = load()[id];
            if (override === 'open') return true;
            if (override === 'closed') return false;
            return defaultIsOpen(depth);
        },
        setOpen(id, open) {
            const map = load();
            map[id] = open ? 'open' : 'closed';
            save(map);
        },
    };
}
