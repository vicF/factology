// Transitional re-export shim — the event bus now lives in the engine package
// (packages/engine/src/eventBus.js). Kept until all app imports move to
// @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/eventBus.js';
