// Transitional re-export shim — the Dexie store for GEDCOM imports now lives
// in the engine package (packages/engine/src/gedcom/dexieStore.js). Kept until
// all app imports move to @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/gedcom/dexieStore.js';
