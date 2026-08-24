import { storageSync } from '../utils/storage';

const STORAGE_KEY = 'factology:classTree:nodeState';
// Nodes at depth >= 1 start collapsed → 2 levels visible by default
export const COLLAPSE_FROM_DEPTH = 1;

// Module-level cache. Loaded once from storage; persists for the module's
// lifetime so the tree survives component remounts (e.g. mobile ↔ desktop
// branch swap on rotation) even when storageSync is a no-op on native.
let nodeState = null;
let toggleCount = 0;

function load() {
    if (nodeState === null) {
        try {
            const raw = storageSync.get(STORAGE_KEY);
            nodeState = JSON.parse(raw || '{}');
            console.log('[useTreeState] INIT from storage:', nodeState);
        } catch {
            nodeState = {};
            console.log('[useTreeState] INIT fallback to {}');
        }
    }
    return nodeState;
}
function save(map) {
    nodeState = map;
    storageSync.set(STORAGE_KEY, JSON.stringify(map));
    console.log('[useTreeState] SAVED:', map);
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
            const state = load();
            const override = state[id];
            const result = override === 'open' ? true : override === 'closed' ? false : defaultIsOpen(depth);
            console.log('[useTreeState] isOpen', id, 'depth', depth, '→', result, '(cache keys:', Object.keys(state), ')');
            return result;
        },
        setOpen(id, open) {
            const map = load();
            map[id] = open ? 'open' : 'closed';
            toggleCount++;
            console.log('[useTreeState] setOpen #' + toggleCount, id, open, '→ cache now:', JSON.stringify(map));
            save(map);
        },
        _debugState() {
            return { ...load(), _toggles: toggleCount };
        },
    };
}
