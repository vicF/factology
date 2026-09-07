// Transitional re-export shim — identity wallet code now lives in the engine
// package (packages/engine/src/identity/identity.js). Kept until all app
// imports move to @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/identity/identity.js';
