// Transitional re-export shim — the Dexie schema now lives in the engine
// package (packages/engine/src/localDb/schema.js). Kept until all app imports
// move to @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/localDb/schema.js';
