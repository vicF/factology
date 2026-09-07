// Transitional re-export shim — the local API handler now lives in the engine
// package (packages/engine/src/localDb/apiHandler.js). Kept until all app
// imports move to @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/localDb/apiHandler.js';
