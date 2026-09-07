// Transitional re-export shim — link CRUD now lives in the engine package
// (packages/engine/src/localDb/links.js). Kept until all app imports move to
// @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/localDb/links.js';
