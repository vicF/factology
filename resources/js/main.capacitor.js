// resources/js/main.capacitor.js
//
// Entry point for Capacitor (standalone) builds.
// Includes the standard app AND the local DB adapter.
// This separate entry ensures the adapter code cannot be tree-shaken.

import './app';
import './localDb/standaloneBootstrap';
