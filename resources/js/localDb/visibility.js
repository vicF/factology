// Transitional re-export shim — the owner-visibility filter now lives in the
// engine package (packages/engine/src/localDb/visibility.js). Kept until all
// app imports move to @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/localDb/visibility.js';
