// resources/js/errorOverlay.js
//
// Captures all JS errors and displays them on screen. Useful for mobile
// debugging where DevTools aren't available. Shows errors as a floating
// overlay that can be dismissed.
//
// Injected early (before Vue app) so even bootstrap errors are visible.

// Only in Capacitor builds
const isCapacitor = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform();

const errors = [];

function renderOverlay() {
    let overlay = document.getElementById('__error_overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = '__error_overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            z-index: 999999; background: #1a1a2e; color: #e0e0e0;
            font-family: monospace; font-size: 12px; padding: 20px;
            overflow-y: auto; display: none;
        `;
        overlay.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <h2 style="margin:0;color:#ff6b6b;font-size:16px">⚠️ JS Errors</h2>
                <button id="__error_close" style="background:#ff6b6b;border:none;color:white;padding:4px 12px;border-radius:4px;cursor:pointer">Close</button>
            </div>
            <div id="__error_list"></div>
        `;
        document.body.appendChild(overlay);
        document.getElementById('__error_close').onclick = () => { overlay.style.display = 'none'; };
    }
    const list = document.getElementById('__error_list');
    if (errors.length === 0) {
        list.innerHTML = '<div style="color:#51cf66">No errors captured</div>';
    } else {
        list.innerHTML = errors.map((e, i) =>
            `<div style="margin-bottom:8px;padding:8px;background:#2d2d44;border-radius:4px;border-left:3px solid #ff6b6b">
                <div style="color:#ff6b6b;font-weight:bold">#${i + 1}: ${e.message || 'Unknown error'}</div>
                <div style="color:#a0a0c0;margin-top:4px;white-space:pre-wrap">${e.stack || '(no stack)'}</div>
            </div>`
        ).join('');
    }
}

function showOverlay() {
    const overlay = document.getElementById('__error_overlay');
    if (overlay) overlay.style.display = 'block';
    renderOverlay();
}

// Capture unhandled errors
window.addEventListener('error', (event) => {
    errors.push({ message: event.message || String(event.error), stack: event.error?.stack || '' });
    renderOverlay();
    // Show overlay automatically after 3 errors
    if (errors.length >= 3) showOverlay();
});

// Capture unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    errors.push({
        message: reason?.message || String(reason || 'Unknown promise rejection'),
        stack: reason?.stack || '',
    });
    renderOverlay();
    if (errors.length >= 3) showOverlay();
});

// Expose globally so Vue's error handler can push to it
window.__captureError = (err) => {
    errors.push({ message: err?.message || String(err), stack: err?.stack || '' });
    renderOverlay();
};

// Also expose show/dismiss for manual use
window.__showErrors = showOverlay;
window.__dismissErrors = () => {
    const overlay = document.getElementById('__error_overlay');
    if (overlay) overlay.style.display = 'none';
};

// Tap the build ID area 5 times to show errors (handled by Default.vue)