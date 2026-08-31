// tests-js/electron/electron_smoke_test.js
//
// Launches the REAL Electron desktop app (not the static build) and verifies
// the UI boots and behaves correctly. This catches issues the browser-based
// standalone tests miss: IndexedDB-on-full-disk, blank screens on link
// clicks, window/shell problems.
//
// Requires: playwright (global install works via NODE_PATH)
// Usage (from the factology-dev3 root):
//   NODE_PATH="C:\Users\Victor\AppData\Roaming\npm\node_modules" \
//     node tests-js/electron/electron_smoke_test.js

const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const ELECTRON_DIR = path.join(__dirname, '..', '..', 'electron');
const ELECTRON_EXE = path.join(
    ELECTRON_DIR,
    'node_modules',
    'electron',
    'dist',
    process.platform === 'win32' ? 'electron.exe' : 'electron'
);

// Keep temp/cache off the (often full) C: drive.
process.env.TMP = process.env.TMP || 'D:/tmp';
process.env.TEMP = process.env.TEMP || 'D:/tmp';

// Redirect the app's user-data dir (IndexedDB/Dexie) off C: — Chromium fails
// to create IndexedDB on a full disk, leaving the app stuck on the spinner.
process.env.FACTOLOGY_USER_DATA = process.env.FACTOLOGY_USER_DATA || 'D:/tmp/factology-test-userdata';

const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function waitForAppReady(win) {
    // App is ready when the loading spinner/class is gone and the layout rendered
    await win.waitForFunction(
        () =>
            !document.body.classList.contains('page-loading') &&
            !!document.querySelector('.app-container') &&
            !!document.querySelector('.navbar'),
        { timeout: 40000 }
    );
}

async function main() {
    if (!fs.existsSync(ELECTRON_EXE)) {
        console.error('Electron binary not found at:', ELECTRON_EXE);
        process.exit(1);
    }

    console.log('Launching Electron app...');
    const userDataDir = 'D:/tmp/electron-test-profile';
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.mkdirSync(userDataDir, { recursive: true });
    const app = await _electron.launch({
        executablePath: ELECTRON_EXE,
        args: ['.'],
        cwd: ELECTRON_DIR,
        env: process.env,
        userDataDir,
    });
    const win = await app.firstWindow();
    win.setDefaultTimeout(40000);

    // ── 1. App boots over the local HTTP server ────────────────────────
    // (file:// is deliberately NOT used — IndexedDB/Dexie fails on file://)
    const url = win.url();
    check('App loads over http://127.0.0.1', url.startsWith('http://127.0.0.1'), url);

    // ── 2. Vue app mounts (spinner replaced) ───────────────────────────
    await waitForAppReady(win);
    check('Vue app mounted (.app-container visible)', true);

    // ── 3. Navbar renders ──────────────────────────────────────────────
    check('Navbar rendered', true);

    const hasUserDropdown = await win.locator('[data-testid="user-dropdown-btn"]').count();
    check('User dropdown present', hasUserDropdown > 0);

    // ── 4. Tree menu renders (seed data loaded via Dexie) ──────────────
    const treeCount = await win.locator('.tree-menu, [class*="tree"]').count();
    check('Tree menu rendered', treeCount > 0);

    // ── 5. Navigate to an object page, then click a LinkDescription link ─
    // Regression test: LinkDescription renders <a href="/object/{id}"> via
    // v-html. A raw click caused full-page navigation → blank screen in
    // Electron. The router-interception fix must keep the app on the SPA.
    const objectLinkCount = await win.locator('a[href^="/object/"]').count();
    let navChecked = false;
    if (objectLinkCount === 0) {
        // No LinkDescription anchors on the dashboard — open the first class
        // from the tree menu (dropdown links are #/object/{id}).
        const firstTreeLink = win.locator('[class*="tree"] a[href^="#/object/"]').first();
        if (await firstTreeLink.count()) {
            await firstTreeLink.click();
            await win.waitForFunction(
                () => location.hash.match(/^#\/object\//) && !!document.querySelector('.app-container'),
                { timeout: 20000 }
            );
            navChecked = true;
        }
    }
    check('Opened an object page', navChecked || objectLinkCount > 0);

    // Now find and click a raw /object/ anchor (LinkDescription output)
    const anchorCount = await win.locator('a[href^="/object/"]').count();
    console.log(`   (found ${anchorCount} raw /object/ anchor(s) on the object page)`);
    if (anchorCount > 0) {
        await win.locator('a[href^="/object/"]').first().click();
        await win.waitForFunction(
            () => location.hash.match(/^#\/object\//) && !!document.querySelector('.app-container'),
            { timeout: 20000 }
        );
        const hash = await win.evaluate(() => location.hash);
        check('LinkDescription link click navigated via router (no blank screen)', hash.startsWith('#/object/'), hash);
    } else {
        check('LinkDescription link click navigated via router (no blank screen)', false, 'no /object/ anchor on object page');
    }

    await app.close();

    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
        console.log('Failed:', failed.map(r => r.name).join(' | '));
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('Test crashed:', err);
    process.exit(1);
});
