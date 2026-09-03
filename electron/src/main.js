const { app, BrowserWindow, globalShortcut } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Default the user-data directory (IndexedDB/Dexie lives there) to the D:
// drive when present — the default %APPDATA%/factology-desktop sits on C:,
// and Chromium fails to create a fresh IndexedDB store on a full disk
// ("UnknownError: Internal error"), leaving the app stuck on the spinner.
// FACTOLOGY_USER_DATA always wins; without a D: drive we fall back to the
// OS default location.
const userDataOverride = process.env.FACTOLOGY_USER_DATA;
if (userDataOverride) {
    app.setPath('userData', userDataOverride);
} else if (process.platform === 'win32' && fs.existsSync('D:\\')) {
    app.setPath('userData', 'D:/factology-desktop-data');
}

// The SPA is served over a local HTTP server (not file://) because Chromium's
// IndexedDB is unreliable on the file:// protocol — Dexie fails to open with
// "UnknownError: Internal error", leaving the app stuck on the loading screen.
// http://localhost gives a proper origin that IndexedDB handles reliably.
const APP_DIR = path.join(__dirname, '..', 'app');
let serverUrl = null;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.map': 'application/json',
};

function startStaticServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
            if (pathname === '/') pathname = '/index.html';

            // Prevent path traversal outside APP_DIR
            const filePath = path.join(APP_DIR, path.normalize(pathname));
            if (!filePath.startsWith(APP_DIR)) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                res.writeHead(200, {
                    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
                });
                res.end(data);
            });
        });

        // Listen on an ephemeral port (0) — avoids conflicts
        server.listen(0, '127.0.0.1', () => {
            serverUrl = `http://127.0.0.1:${server.address().port}`;
            console.log(`[main] Serving SPA at ${serverUrl}`);
            resolve(server);
        });
    });
}

async function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: false,
        title: 'Factology',
    });

    // Show window when ready to avoid flash (registered BEFORE loadURL —
    // ready-to-show fires while the page renders, and attaching it after an
    // awaited loadURL would miss it, leaving the window never shown).
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Load the Capacitor-built SPA from the local HTTP server
    await mainWindow.loadURL(`${serverUrl}/`);

    // Debug: forward renderer console + load status to the terminal
    mainWindow.webContents.on('console-message', (event) => {
        console.log(`[renderer:${event.level}] ${event.message}`);
    });
    mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
        console.error(`[renderer] did-fail-load ${code} ${desc} ${url}`);
    });
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('[renderer] did-finish-load');
    });
}

let server;
app.whenReady().then(async () => {
    server = await startStaticServer();
    await createWindow();

    // F12 / Ctrl+Shift+I → open DevTools for debugging
    globalShortcut.register('F12', () => {
        BrowserWindow.getFocusedWindow()?.webContents.openDevTools({ mode: 'detach' });
    });
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        BrowserWindow.getFocusedWindow()?.webContents.openDevTools({ mode: 'detach' });
    });
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (server) server.close();
});

app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow();
    }
});
