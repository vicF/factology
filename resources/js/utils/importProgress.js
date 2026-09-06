// resources/js/utils/importProgress.js
//
// Tiny in-app event bus for long local imports (JSON backup, GEDCOM, data
// import). Importer code posts progress; UI panels subscribe while an import
// runs and unsubscribe when it finishes. Keeps importers UI-agnostic (they
// don't know about Vue components) and lets multiple subscribers coexist.

const listeners = new Set();

/**
 * Subscribe to import progress.
 * @param {(info: {phase: string, done: number, total: number, percent: number}) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onImportProgress(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/**
 * Publish an import-progress update (no-op when nobody is subscribed).
 * @param {{phase: string, done: number, total: number, percent: number}} info
 */
export function postImportProgress(info) {
    if (listeners.size === 0) return;
    listeners.forEach((fn) => {
        try { fn(info); } catch { /* subscriber threw */ }
    });
}
