// Transitional re-export shim — sync-status constants now live in the engine
// package (packages/engine/src/constants/syncStatus.js). Kept until all app
// imports move to @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/constants/syncStatus.js';
