// resources/js/main.capacitor.js
//
// Entry point for Capacitor (standalone) builds.
// Includes the standard app AND the local DB adapter.
// This separate entry ensures the adapter code cannot be tree-shaken.

import { bootstrapStandalone } from './localDb/standaloneBootstrap';

// ORDER MATTERS: app.js starts its initial API calls (auth, public settings)
// and mounts the app while its module body evaluates, so the Dexie adapter has
// to be installed on axios before that. A static `import './app'` cannot
// guarantee it — module evaluation runs every dependency's body before
// awaiting an async (top-level `await`) sibling, so ./app ran regardless of
// the order of the two imports. Hence the explicit `await` + dynamic import:
// ./app is evaluated only once the adapter is ready. With ./app evaluated
// early, its calls went out through the default HTTP adapter — in the Vite dev
// server (no backend) every one of them 404'd, which left the class tree empty
// behind a blocking "Error loading class tree" alert.

await bootstrapStandalone();

// Register window focus/blur handler (Electron IPC via preload).
// On blur: save the database immediately so other apps sharing the
// same SQLite file read the latest data. On focus: re-read the DB
// to pick up changes from other processes.
// Register window focus/blur handler (Electron IPC via preload).
// On blur: save the database immediately so the .sqlite file on
// disk is current when another app (SetTempo, Pawlo, etc.) reads
// it.  This is the critical direction — we never reload on focus
// because there is no meaningful merge: the entire DB is a single
// blob, and re-reading from disk would just discard our own state.
// The correct multi-app sync approach is separate databases with
// JSON export/import (see docs/DATABASE-DEV-GUIDE.md).
if (typeof window !== 'undefined' && window.__factology_window_focus) {
    const { getDb } = await import('@factology/engine/localDb/index.js');
    window.__factology_window_focus.onWindowFocusChange(async (state) => {
        if (state === 'blur') {
            const db = getDb();
            if (typeof db.save === 'function') await db.save();
        }
    });
} else if (typeof window !== 'undefined') {
    // Non-Electron (Capacitor, browser): use page-visibility events as
    // a best-effort approximation.  `visibilitychange` fires on browser
    // tab switch and device sleep — save the DB so shared-storage peers
    // see the latest data.
    const { getDb } = await import('@factology/engine/localDb/index.js');
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            const db = getDb();
            if (typeof db.save === 'function') db.save();
        }
    });
}

try {
    await import('./app');
} catch (e) {
    throw e;
}
