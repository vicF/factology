// tests-js/mobile/app_smoke_test.js
//
// Mobile smoke tests, run on an Android emulator/device via Appium
// (codeceptjs Appium helper). Requires a debug APK built in standalone mode:
//   bash build-android.sh --local
// so the app runs fully offline against the local Dexie storage layer.

Feature('Mobile smoke');

// @smoke: app launches, the Capacitor WebView loads, Vue mounts, the router
// renders the dashboard, and the local storage layer serves seeded demo data.
// Note: use .tag('@smoke') (not the `tags` option) so `--grep '@smoke'` matches.

// The app is a Capacitor WebView; switch to the WEBVIEW context explicitly
// (codeceptjs has no autoWebview support).
Before(({ I }) => {
    I.switchToWeb();
});

Scenario('app launches and renders the dashboard with local data', ({ I }) => {
    // #search is only present after Vue mounts and the router renders the
    // dashboard (default route '/').
    I.waitForElement('#search', 45);
    // The standalone seeder populates the same classes as the web app; the
    // dashboard results list proves the local Dexie data layer works end to end.
    I.waitForElement('.result-item', 60);
    // Seeded classes from DatabaseSeeder.php are visible in the dashboard.
    // (waitForFunction is more reliable in the webview than waitForText.)
    I.waitForFunction(() => document.body.innerText.includes('Everything'), [], 20);
    I.waitForFunction(() => document.body.innerText.includes('Vehicle'), [], 20);
    I.say('✓ App launched, WebView loaded, seeded class list rendered');
}).tag('@smoke');
