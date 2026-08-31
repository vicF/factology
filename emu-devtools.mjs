// emu-devtools.mjs — persistent DevTools bridge for the emulator WebView.
//
// Fixes the blank-screen chrome://inspect issue (desktop Chrome frontend version
// != WebView version) AND survives app restarts:
//
//   1. Keeps `adb forward tcp:9333` pointed at the CURRENT WebView PID, so the
//      forward never goes stale when the app restarts.
//   2. Serves a tiny HTTP server on 9334 that looks up the current page target
//      and redirects your browser to the version-matched DevTools frontend URL.
//
// Usage: node emu-devtools.mjs    (Ctrl+C to stop)
// Then open http://127.0.0.1:9334 in any Chromium browser and hit refresh
// whenever the app restarts.

import { execSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PID_FILE = path.join(__dirname, '.emu-devtools.pid');

const ADB = process.env.ANDROID_HOME
    ? `${process.env.ANDROID_HOME.replace(/\\/g, '/')}/platform-tools/adb`
    : 'adb';
const PACKAGE = 'com.factology.app';
const CDP_PORT = 9333;
const PROXY_PORT = 9335;   // WS proxy — strips Origin (WebView rejects all Origins)
const REDIRECT_PORT = 9334;

let lastPid = null;

function adb(...args) {
    try {
        return execSync(`"${ADB}" ${args.join(' ')}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return '';
    }
}

function currentPid() {
    return adb('shell', 'pidof', PACKAGE).replace(/\s+/g, '');
}

function keepForwardAlive() {
    const pid = currentPid();
    if (pid && pid !== lastPid) {
        // Re-point the forward at the new WebView process.
        adb('forward', '--remove-all');
        adb('forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
        console.log(`[devtools] forward -> WebView PID ${pid}`);
        lastPid = pid;
    } else if (!pid) {
        console.log('[devtools] app not running (waiting for com.factology.app)...');
        lastPid = null;
    }
}

// Look up the current page target's version-matched DevTools URL.
// The browser is pointed at the local WS proxy (PROXY_PORT), which strips the
// Origin header before forwarding to the WebView (CDP_PORT).
function frontendUrl() {
    const list = adb('shell', `curl -s http://127.0.0.1:${CDP_PORT}/json`);
    // adb shell may not have curl; fall back to a host-side fetch through the forward.
    let body = list && list.startsWith('[') ? list : hostFetch(`http://127.0.0.1:${CDP_PORT}/json`);
    try {
        const targets = JSON.parse(body);
        const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (!page) return null;
        // Rewrite ws=127.0.0.1:9333 → ws=127.0.0.1:9335 (Origin-stripping proxy).
        return page.devtoolsFrontendUrl.replace(`127.0.0.1:${CDP_PORT}`, `127.0.0.1:${PROXY_PORT}`);
    } catch {
        return null;
    }
}

function hostFetch(url) {
    try {
        return execSync(
            `node -e "const h=require('http');h.get('${url}',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>process.stdout.write(d))})"`,
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
        ).trim();
    } catch {
        return '';
    }
}

// ── WebSocket proxy ─────────────────────────────────────────────────────
// The WebView's CDP server rejects WebSocket handshakes that carry ANY
// Origin header. Browsers always send Origin on WebSocket connections, so
// the DevTools frontend can never attach directly. This proxy terminates the
// browser's handshake locally (accepting whatever Origin) and opens a fresh
// no-Origin connection to the WebView, then pipes raw frames both ways.

function wsAccept(key) {
    return crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
}

const wsProxy = net.createServer((browserSocket) => {
    let buf = '';
    let done = false;

    function fail(msg) {
        if (!done) {
            done = true;
            console.log('[wsproxy] handshake failed:', msg);
            try { browserSocket.destroy(); } catch { /* ignore */ }
        }
    }

    browserSocket.on('data', (chunk) => {
        if (done) return;
        buf += chunk.toString('latin1');
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;

        const header = buf.slice(0, idx);
        // Any bytes past the handshake terminator are the browser's first frames.
        const head = Buffer.from(buf.slice(idx + 4), 'latin1');
        done = true;

        const lines = header.split('\r\n');
        const [method, target] = lines[0].split(' ');
        if (method !== 'GET') return fail('not a GET');

        const headers = {};
        for (const line of lines.slice(1)) {
            const c = line.indexOf(':');
            if (c > 0) headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim();
        }
        if (!headers['sec-websocket-key']) return fail('no Sec-WebSocket-Key');

        // ── 1. Complete the browser handshake (any Origin is fine) ──
        browserSocket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${wsAccept(headers['sec-websocket-key'])}\r\n\r\n`
        );

        // ── 2. Open a no-Origin connection to the WebView ──
        const upstream = net.connect(CDP_PORT, '127.0.0.1');
        let upBuf = '';
        let upReady = false;

        const safeWrite = (sock, buf) => {
            try { if (sock && sock.writable) sock.write(buf); } catch { /* socket already closed */ }
        };

        // Frames from the browser buffer up until the upstream handshake is done,
        // then flush. (The browser can send its first frame before the upstream
        // even connects — never drop it.)
        const pending = head.length > 0 ? [head] : [];
        browserSocket.on('data', (d) => {
            if (upReady) safeWrite(upstream, d);
            else pending.push(d);
        });

        const flush = () => {
            while (pending.length > 0) safeWrite(upstream, pending.shift());
        };

        upstream.on('connect', () => {
            const key = crypto.randomBytes(16).toString('base64');
            const req =
                `GET ${target} HTTP/1.1\r\n` +
                'Host: 127.0.0.1\r\n' +
                'Upgrade: websocket\r\n' +
                'Connection: Upgrade\r\n' +
                `Sec-WebSocket-Key: ${key}\r\n` +
                'Sec-WebSocket-Version: 13\r\n\r\n';
            upstream.write(req);
        });

        upstream.on('data', (uChunk) => {
            if (upReady) {
                // Frames from the WebView flow straight to the browser.
                safeWrite(browserSocket, uChunk);
                return;
            }
            upBuf += uChunk.toString('latin1');
            const ui = upBuf.indexOf('\r\n\r\n');
            if (ui === -1) return;
            const status = upBuf.slice(0, ui).split('\r\n')[0];
            if (!status.includes('101')) return fail('upstream: ' + status);
            upReady = true;
            const extra = upBuf.slice(ui + 4);
            if (extra.length > 0) safeWrite(browserSocket, Buffer.from(extra, 'latin1'));
            // Release any frames the browser sent before the upstream was ready.
            flush();
        });

        // A DevTools tab that closes or a WebView that restarts can reset the
        // socket mid-frame — without an 'error' listener Node crashes the whole
        // bridge. Swallow and clean up instead.
        browserSocket.on('error', () => { try { upstream.destroy(); } catch { /* ignore */ } });
        upstream.on('error', () => { try { browserSocket.destroy(); } catch { /* ignore */ } });
        upstream.on('close', () => { try { browserSocket.destroy(); } catch { /* ignore */ } });
        browserSocket.on('close', () => { try { upstream.destroy(); } catch { /* ignore */ } });
    });
});

wsProxy.on('error', (e) => console.log('[wsproxy] error:', e.message));
wsProxy.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log(`[wsproxy] Origin-stripping WS proxy on 127.0.0.1:${PROXY_PORT}`);
});

const server = http.createServer((req, res) => {
    keepForwardAlive();
    const url = frontendUrl();
    if (url) {
        res.writeHead(302, { Location: url });
        res.end(`<a href="${url}">Open DevTools</a>`);
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif">
<h2>DevTools bridge</h2>
<p>No WebView target found yet.</p>
<p>Start the app (or wait for it to load), then <a href="/">refresh this page</a>.</p>
<p>Forward status: PID ${lastPid || '—'}</p></body>`);
    }
});

try {
    writeFileSync(PID_FILE, String(process.pid));
} catch { /* best effort */ }
process.on('exit', () => { try { unlinkSync(PID_FILE); } catch { /* ignore */ } });
process.on('SIGINT', () => { try { unlinkSync(PID_FILE); } catch { /* ignore */ } process.exit(0); });
process.on('SIGTERM', () => { try { unlinkSync(PID_FILE); } catch { /* ignore */ } process.exit(0); });

server.listen(REDIRECT_PORT, '127.0.0.1', () => {
    console.log('');
    console.log('==> DevTools bridge running. Open this URL in any Chromium browser:');
    console.log(`    http://127.0.0.1:${REDIRECT_PORT}`);
    console.log('');
    console.log('    Refresh the page whenever the app restarts.');
    console.log('    Ctrl+C to stop the bridge (DevTools will disconnect).');
    console.log('');
});

setInterval(keepForwardAlive, 2000);
keepForwardAlive();
