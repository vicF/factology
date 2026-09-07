// Transitional re-export shim — the data layer now lives in the engine
// package (packages/engine/src/dataLayer/index.js). Kept until all app
// imports move to @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/dataLayer/index.js';
