// Transitional re-export shim — the GEDCOM parser now lives in the engine
// package (packages/engine/src/gedcom/gedcomParser.js). Kept until all app
// imports move to @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/gedcom/gedcomParser.js';
