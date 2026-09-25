// tests-js/e2e/acceptance/objects_test.js
// Shared tests for object CRUD — runs on both Web SPA and Standalone modes.
//
// Tags:
//  @api     — requires API server (multi-user, permissions)
//  @local   — works with local DB only (standalone mode)
//  @all     — works everywhere

const { I } = inject();

Feature('Objects');

BeforeSuite(async ({ I }) => {
    // Seed test objects via API (Web SPA mode). In standalone mode,
    // the local DB has its own seed data so the API call will fail silently.
    try {
        const resp = await I.sendPostRequest('/api/test/seed-objects');
        if (resp.status !== 200 && resp.status !== 201) {
            console.log('[BeforeSuite] API seed not available (likely standalone mode)');
        }
    } catch (e) {
        console.log('[BeforeSuite] API seed not available (likely standalone mode)');
    }
});

/**
 * Standalone (offline) builds have no server session: a first run lands on the
 * Welcome gate and a guest may only READ. The write scenarios below therefore
 * need an unlocked identity. The UI flow also triggers an identity-file
 * download, which headless runs cannot accept, so drive the same store action
 * the form calls.
 */
async function createOfflineIdentity() {
    await I.executeScript(async () => {
        const pinia = document.getElementById('app').__vue_app__.config.globalProperties.$pinia;
        const store = pinia._s.get('identity');
        await store.restore();
        if (store.items.length === 0) {
            await store.createAndSave({
                name: 'E2E User',
                passphrase: 'e2e-passphrase-1234',
                createdBy: 'e2e',
            });
        }
    });
}

/**
 * Open `/` and make sure we are past the offline gate (creating an identity if
 * a fresh install shows the Welcome gate). No-op in Web SPA mode.
 */
async function openDashboard() {
    I.amOnPage('/');
    I.waitForInvisible('.spinner-border', 15);
    // The gate mounts asynchronously, so wait for it or for the dashboard.
    I.waitForElement('[data-testid="welcome-create"], .add-object', 20);
    if (await I.grabNumberOfVisibleElements('[data-testid="welcome-create"]') > 0) {
        await createOfflineIdentity();
        I.amOnPage('/');
        I.waitForInvisible('.spinner-border', 15);
        I.waitForElement('.add-object', 20);
    }
}

/** Create an object through the UI (the modal opened by the 📦 button on a class). */
async function createObject(name, classId = null) {
    // The 📦 `.add-object` button lives on every class-tree row and opens the
    // create-object modal for THAT class. Without an explicit class the first
    // row is used (the root class).
    const button = classId
        ? `.tree-node[id="${classId}"] .add-object`
        : '.add-object';
    I.waitForElement(button, 15);
    // Use force click because .add-object is a span that may be overlapped
    I.click(button, null, { force: true });
    I.waitForElement('input[name="name"]', 15);
    I.fillField('input[name="name"]', name);
    // Click the Save button inside the modal footer (NOT the navbar search button)
    I.click({css: '.modal-footer .btn-primary'});
    I.wait(2);
}

/**
 * Standalone mode starts with classes only, and the class tree comes up with a
 * default selection (the event-ish classes). An object created in an unselected
 * class is hidden by that active filter, so pick a class the user already has
 * checked — the new object then matches the filter and shows up in the results.
 * Returns null in Web SPA mode, where the API seed already provides objects.
 */
async function pickSelectedClassId() {
    return await I.executeScript(() => {
        const pinia = document.getElementById('app').__vue_app__.config.globalProperties.$pinia;
        const searchStore = pinia._s.get('search');
        for (const id of searchStore.checkedItems) {
            if (document.querySelector(`.tree-node[id="${CSS.escape(id)}"] .add-object`)) {
                return id;
            }
        }
        return null;
    });
}

Scenario('Search page loads and shows objects @all', async () => {
    await openDashboard();
    // Desktop or mobile view is always present in the layout
    I.waitForElement('[data-testid="desktop-view"], [data-testid="mobile-view"]', 15);
    // Wait for search to finish loading (objects might be async)
    I.waitForInvisible('.spinner-border', 15);
    // After loading, either results appear or the "No results" text does —
    // a fresh offline DB only holds classes, so "No results" is valid there.
    I.waitForElement('.results-list, .result-item, .text-muted', 15);
});

Scenario('Open an object detail view @all', async () => {
    await openDashboard();
    // A fresh offline DB has no objects, only classes — create one to open.
    if (await I.grabNumberOfVisibleElements('.result-item a, .title-link, .result-title a') === 0) {
        const classId = await pickSelectedClassId();
        await createObject('E2E Detail Target', classId);
        // Reload so the search list includes the new object.
        I.amOnPage('/');
        I.waitForInvisible('.spinner-border', 15);
    }
    // Wait for a result link to appear before clicking
    I.waitForElement('.result-item a, .title-link, .result-title a', 15);
    I.click('.result-item a, .title-link, .result-title a');
    // Object page renders with .object-header
    I.waitForElement('.object-header, .object-title', 15);
});

Scenario('Create a new object @all', async () => {
    await openDashboard();
    await createObject('E2E Test');
});

Scenario('Classes are visible in the class tree @all', async () => {
    await openDashboard();
    I.waitForElement('.tree-menu, .tree-node', 20);
    I.seeElement('.tree-node, .tree-item');
});
