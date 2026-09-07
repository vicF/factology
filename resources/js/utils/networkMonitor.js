// Transitional re-export shim — the network monitor now lives in the engine
// package (packages/engine/src/utils/networkMonitor.js). Kept until all app
// imports move to @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/utils/networkMonitor.js';
