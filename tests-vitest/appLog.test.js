// tests-vitest/appLog.test.js
//
// Guards the in-app error log (utils/appLog.js): console capture, window
// errors, persistence, the bounded ring buffer, dedupe and the copy/clear
// helpers. This is what lets desktop/mobile users see & copy errors without
// DevTools.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    installAppLog,
    addLogEntry,
    clearLogEntries,
    getLogEntries,
    subscribeToLog,
    formatLogForClipboard,
} from '@/utils/appLog';

const STORAGE_KEY = 'factology_app_log_v1';

beforeEach(() => {
    clearLogEntries();
    localStorage.removeItem(STORAGE_KEY);
});

afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
});

describe('appLog entries', () => {
    it('adds entries with timestamp/level/origin and notifies subscribers', () => {
        const seen = [];
        const unsub = subscribeToLog((entries) => { seen.push([...entries]); });

        addLogEntry('error', new Error('boom'), { origin: 'test' });

        const entries = getLogEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0].message).toBe('boom');
        expect(entries[0].stack).toContain('Error: boom');
        expect(entries[0].level).toBe('error');
        expect(entries[0].origin).toBe('test');
        expect(typeof entries[0].ts).toBe('number');
        expect(seen.length).toBeGreaterThanOrEqual(1);
        unsub();
    });

    it('coalesces rapid repeats of the same error into a count', () => {
        addLogEntry('error', 'same failure');
        addLogEntry('error', 'same failure');
        const entries = getLogEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0].count).toBe(2);
    });

    it('keeps distinct errors as separate entries', () => {
        addLogEntry('error', 'first');
        addLogEntry('error', 'second');
        expect(getLogEntries()).toHaveLength(2);
    });

    it('caps the buffer at 300 entries', () => {
        for (let i = 0; i < 400; i++) {
            addLogEntry('error', `err ${i}`);
        }
        expect(getLogEntries()).toHaveLength(300);
    });
});

describe('appLog global capture', () => {
    it('captures console.error and console.warn', () => {
        installAppLog();
        const original = console.error;
        // eslint-disable-next-line no-console
        console.error('import failed', new Error('whoops'));
        console.error = original;

        const entries = getLogEntries();
        expect(entries.some(e => e.level === 'error' && e.message.includes('import failed'))).toBe(true);
        // The Error object contributes its stack to the captured entry.
        expect(entries.some(e => e.stack && e.stack.includes('whoops'))).toBe(true);
    });

    it('captures window error events', () => {
        installAppLog();
        const ev = new Event('error');
        ev.error = new Error('window boom');
        ev.message = 'window boom';
        window.dispatchEvent(ev);

        expect(getLogEntries().some(e => e.origin === 'window' && e.message === 'window boom')).toBe(true);
    });

    it('captures unhandled promise rejections', () => {
        installAppLog();
        const ev = new Event('unhandledrejection');
        ev.reason = new Error('rejection boom');
        window.dispatchEvent(ev);

        expect(getLogEntries().some(e => e.origin === 'unhandledrejection' && e.message === 'rejection boom')).toBe(true);
    });
});

describe('appLog persistence + copy', () => {
    it('persists entries to localStorage', () => {
        addLogEntry('error', 'persist me');
        const raw = localStorage.getItem(STORAGE_KEY);
        expect(raw).toBeTruthy();
        const stored = JSON.parse(raw);
        expect(stored[0].message).toBe('persist me');
    });

    it('formatLogForClipboard renders a readable text blob', () => {
        addLogEntry('error', 'clipboard text', { stack: 'at line 1' });
        const text = formatLogForClipboard();
        expect(text).toContain('clipboard text');
        expect(text).toContain('at line 1');
        expect(text).toContain('ERROR');
    });

    it('clearLogEntries empties the log and the stored copy', () => {
        addLogEntry('error', 'to clear');
        clearLogEntries();
        expect(getLogEntries()).toHaveLength(0);
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toHaveLength(0);
    });
});
