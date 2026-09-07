// Transitional re-export shim — flexible dates now live in the engine package
// (packages/engine/src/utils/flexibleDate.js). The app registers its locale
// provider at bootstrap via setFlexibleDateLocaleProvider. Kept until all app
// imports move to @factology/engine (P1-S6), then this file is deleted.

export * from '@factology/engine/utils/flexibleDate.js';
