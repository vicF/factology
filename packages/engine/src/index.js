// @factology/engine — public entry.
//
// Universal, Vue-free core shared by every Factology-family app
// (Factology, Pawlo, Genealogy, …). Modules are progressively moved here
// from resources/js as they are decoupled from the UI layer.

export const ENGINE_NAME = '@factology/engine';
export const ENGINE_VERSION = '0.1.0';

// ── Constants (moved from resources/js/constants) ──
export * from './constants/uuid.js';
export * from './constants/eras.js';
export * from './constants/syncStatus.js';
