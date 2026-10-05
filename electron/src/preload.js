// electron/src/preload.js
//
// Exposes a minimal fs API to the renderer so the SQLite backend
// (createBackend → SQLiteAdapter) can read/write the database file
// from the renderer process. contextIsolation is on, so only what
// is explicitly exposed in contextBridge reaches the page.

const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// os.homedir() was removed in Electron 28+. Use environment variables
// which are inherited from the main process on all platforms.
const homedir = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '.';
const DB_DIR = path.join(homedir, '.factology');
const DB_PATH = process.env.FACTOLOGY_DB_PATH || path.join(DB_DIR, 'factology_local.sqlite');

// Track writes for periodic backup (every ~60s of 2s auto-save)
let electronFsWriteCount = 0;

contextBridge.exposeInMainWorld('__factology_electron_fs', {
    readFileSync(filePath) {
        // If .sqlite is missing but .bak exists, restore from backup
        if (!fs.existsSync(filePath)) {
            const bakPath = filePath + '.bak';
            if (fs.existsSync(bakPath)) {
                const bakData = fs.readFileSync(bakPath);
                const tmpPath = filePath + '.tmp.' + process.pid;
                fs.writeFileSync(tmpPath, bakData);
                fs.renameSync(tmpPath, filePath);
                return bakData;
            }
        }
        return fs.readFileSync(filePath);
    },
    writeFileSync(filePath, data) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // Atomic write via unique temp + rename to prevent:
        //  - corruption on power loss (rename is atomic)
        //  - temp-file clash between processes (PID in name)
        const tmpPath = filePath + '.tmp.' + process.pid;
        fs.writeFileSync(tmpPath, data);
        fs.renameSync(tmpPath, filePath);

        // Periodic backup: every 30 writes keep a rolling .bak copy
        electronFsWriteCount++;
        if (electronFsWriteCount % 30 === 0) {
            const bakPath = filePath + '.bak';
            const bakTmp = bakPath + '.tmp.' + process.pid;
            fs.writeFileSync(bakTmp, data);
            fs.renameSync(bakTmp, bakPath);
        }
    },
    existsSync(filePath) {
        return fs.existsSync(filePath);
    },
    mkdirSync(dirPath, opts) {
        return fs.mkdirSync(dirPath, opts);
    },
});

// Expose the resolved DB path so the page can log it.
contextBridge.exposeInMainWorld('__factology_db_path', DB_PATH);

// Flag to differentiate HMR (Vite) from static mode — the WASM file
// paths differ (Vite: /node_modules/sql.js/dist/, static: root /).
contextBridge.exposeInMainWorld('__factology_dev_mode', !!process.env.FACTOLOGY_DEV_URL);

// Window focus/blur events forwarded from the main process (main.js).
// The renderer can register a callback that fires on focus/blur so the
// database is saved immediately when the user switches apps, preventing
// concurrent-write races between Factology-family apps sharing the DB.
let focusChangeCallback = null;
ipcRenderer.on('window-focus-change', (_event, state) => {
    if (focusChangeCallback) focusChangeCallback(state);
});
contextBridge.exposeInMainWorld('__factology_window_focus', {
    onWindowFocusChange(callback) {
        focusChangeCallback = callback;
    },
});