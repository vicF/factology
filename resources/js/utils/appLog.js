// resources/js/utils/appLog.js
//
// In-app error log for the packaged desktop (Electron) and mobile (Android)
// builds, where DevTools aren't available. It keeps the last MAX_ENTRIES
// console / window / promise errors in a ring buffer persisted to
// localStorage, and exposes a live-updating list for the /logs page so the
// user can read and copy the text instead of being told to open F12.
//
// Install once at startup:  installAppLog()
// (app.js also subscribes errorTracker-tracked errors into the same buffer.)

const STORAGE_KEY = 'factology_app_log_v1';
const MAX_ENTRIES = 300;

const listeners = new Set();
let entries = load();
let installed = false;

function load() {
    if (typeof localStorage === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function persist() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
        // Quota exceeded / storage disabled — keep the in-memory buffer only.
    }
}

function notify() {
    listeners.forEach(fn => {
        try { fn(entries); } catch { /* subscriber threw */ }
    });
}

function formatArg(arg) {
    if (arg instanceof Error) return arg.message || String(arg);
    if (typeof arg === 'string') return arg;
    if (arg && typeof arg === 'object') {
        // axios errors / plain objects: keep it short, never throw on cycles.
        try { return JSON.stringify(arg); } catch { return String(arg); }
    }
    return String(arg);
}

/**
 * Coalesce rapid repeats of the same error (e.g. an import loop failing on
 * every record) into one entry with a counter instead of flooding the buffer.
 */
function coalesce(level, message, stack) {
    const last = entries[entries.length - 1];
    if (last && last.level === level && last.message === message && (last.stack || null) === (stack || null)) {
        last.count = (last.count || 1) + 1;
        last.ts = Date.now();
        return true;
    }
    return false;
}

/**
 * Add an entry. `message` may be an Error, a string or anything console.loggable.
 */
export function addLogEntry(level = 'error', message, { origin = 'app', stack = null, meta = null } = {}) {
    const text = formatArg(message);
    const errorStack = (message && message.stack) ? String(message.stack) : (stack || null);

    if (coalesce(level, text, errorStack)) {
        persist();
        notify();
        return;
    }

    entries.push({
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        level,
        origin,
        message: text,
        stack: errorStack,
        meta,
    });

    if (entries.length > MAX_ENTRIES) {
        entries.splice(0, entries.length - MAX_ENTRIES);
    }

    persist();
    notify();
}

export function clearLogEntries() {
    entries = [];
    persist();
    notify();
}

export function getLogEntries() {
    return entries;
}

/** Subscribe to changes; called immediately with the current list. Returns unsubscribe. */
export function subscribeToLog(fn) {
    listeners.add(fn);
    try { fn(entries); } catch { /* ignore */ }
    return () => listeners.delete(fn);
}

/** Render the whole buffer as plain text (for Copy / bug reports). */
export function formatLogForClipboard() {
    if (entries.length === 0) return '(no errors recorded)';
    return entries.map(e => {
        const ts = new Date(e.ts).toISOString();
        const count = (e.count && e.count > 1) ? ` (x${e.count})` : '';
        let out = `[${ts}] ${e.level.toUpperCase()} (${e.origin})${count} ${e.message}`;
        if (e.stack) out += `\n${e.stack}`;
        return out;
    }).join('\n\n');
}

export async function copyLogToClipboard() {
    const text = formatLogForClipboard();
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    // Fallback for older WebViews.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
}

function recordConsole(level, args) {
    const error = args.find(a => a instanceof Error);
    const message = args.map(formatArg).join(' ');
    addLogEntry(level, message || '(empty log call)', { origin: 'console', stack: error?.stack || null });
}

/**
 * Install global capture. Safe to call more than once.
 */
export function installAppLog() {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
        originalError(...args);
        recordConsole('error', args);
    };
    console.warn = (...args) => {
        originalWarn(...args);
        recordConsole('warn', args);
    };

    window.addEventListener('error', event => {
        addLogEntry('error', event.error || event.message, {
            origin: 'window',
            stack: event.error?.stack || null,
        });
    });

    window.addEventListener('unhandledrejection', event => {
        const reason = event.reason;
        addLogEntry('error', reason instanceof Error ? reason : String(reason ?? 'Unhandled promise rejection'), {
            origin: 'unhandledrejection',
            stack: reason?.stack || null,
        });
    });
}
