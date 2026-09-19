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
await import('./app');
