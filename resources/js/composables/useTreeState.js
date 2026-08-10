import { storageSync } from '../utils/storage';

const STORAGE_KEY = 'factology:classTree:nodeState';
// Nodes at depth >= 1 start collapsed → 2 levels visible by default
export const COLLAPSE_FROM_DEPTH = 1;

function load() {
    try {
        return JSON.parse(storageSync.get(STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
}
function save(map) {
    storageSync.set(STORAGE_KEY, JSON.stringify(map));
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
