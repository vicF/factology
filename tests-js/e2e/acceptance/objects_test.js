// tests-js/e2e/acceptance/objects_test.js
// Shared tests for object CRUD — runs on both Web SPA and Standalone modes.
//
// Tags:
//  @api     — requires API server (multi-user, permissions)
//  @local   — works with local DB only (standalone mode)
//  @all     — works everywhere

const { I } = inject();

Feature('Objects');

Scenario('Search page loads and shows objects @all', async () => {
    I.amOnPage('/');
    // Desktop or mobile view is always present in the layout
    I.waitForElement('[data-testid="desktop-view"], [data-testid="mobile-view"]', 15);
    // Wait for search to finish loading (objects might be async)
    I.waitForInvisible('.spinner-border', 15);
    // After loading, either results appear or "No results" text
    I.waitForElement('.results-list, .result-item, .text-muted', 10);
});

Scenario('Open an object detail view @all', async () => {
    I.amOnPage('/');
    I.waitForInvisible('.spinner-border', 15);
    // Click the first result link
    I.click('.result-item a, .title-link, .result-title a');
    // Object page renders with .object-header
    I.waitForElement('.object-header, .object-title', 10);
});

Scenario('Create a new object @all', async () => {
    I.amOnPage('/');
    I.waitForElement('.add-object', 10);
    // Use force click because .add-object is a span that may be overlapped
    I.click('.add-object', null, { force: true });
    I.waitForElement('input[name="name"], .modal', 10);
    I.fillField('input[name="name"]', 'E2E Test');
    I.click('Save, button[type="submit"]');
    I.wait(2);
});

Scenario('Classes are visible in the class tree @all', async () => {
    I.amOnPage('/');
    I.waitForElement('.tree-menu, .class-tree, .tree-node', 10);
    I.seeElement('.tree-node, .tree-item');
});
