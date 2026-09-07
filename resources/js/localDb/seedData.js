// Transitional re-export shim — seed data now lives in the engine package
// (packages/engine/src/localDb/seedData.js). Kept until all app imports move
// to @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/localDb/seedData.js';
