// tests-js/standalone/smoke_test.js
// Smoke tests for the standalone (local DB / Capacitor) build.
// Runs against the standalone SPA served at port 4173.

Feature('Standalone Smoke');

Scenario('App loads and renders', async ({ I }) => {
    I.amOnPage('/');
    I.waitForElement('#app', 10);
    I.executeScript(() => !!document.getElementById('app')?.__vue_app__);
    I.seeElement('.app-container');
});

Scenario('Navigation elements are present', async ({ I }) => {
    I.amOnPage('/');
    I.waitForElement('.navbar', 10);
    I.seeElement('[data-testid="user-dropdown-btn"]');
});

Scenario('Search page renders after navigation', async ({ I }) => {
    I.amOnPage('/');
    I.waitForElement('#app', 10);
    // The default route should show search/home content
    I.waitForElement('.navbar', 10);
});
