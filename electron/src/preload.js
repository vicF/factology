// electron/src/preload.js
//
// Exposes a minimal fs API to the renderer so the SQLite backend
// (createBackend → SQLiteAdapter) can read/write the database file
// from the renderer process. contextIsolation is on, so only what
// is explicitly exposed in contextBridge reaches the page.

const { contextBridge } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_DIR = path.join(os.homedir(), '.factology');
const DB_PATH = process.env.FACTOLOGY_DB_PATH || path.join(DB_DIR, 'factology_local.sqlite');

contextBridge.exposeInMainWorld('__factology_electron_fs', {
    readFileSync(filePath) {
        return fs.readFileSync(filePath);
    },
    writeFileSync(filePath, data) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, data);
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