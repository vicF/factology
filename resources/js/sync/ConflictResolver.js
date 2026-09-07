// Transitional re-export shim — ConflictResolver now lives in the engine
// package (packages/engine/src/sync/ConflictResolver.js). Kept until all app
// imports move to @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/sync/ConflictResolver.js';
