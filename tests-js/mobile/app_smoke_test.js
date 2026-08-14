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

Scenario('objects created locally appear at the top and are editable', async ({ I }) => {
    // The app exposes the standalone-axios (window.axios) that routes every
    // request to the local Dexie adapter — the exact same code path the UI
    // uses. Restore a "Victor Fokin" session first (the adapter defaults a new
    // object's owner to the current user, mirroring the server), then create a
    // new class and verify it (1) is saved with the user as owner and (2) comes
    // back first from the dashboard search (sorted by updated desc).
    const NEW_ID = 'dddddddd-0000-4000-a000-0000000000dd';
    const USER_THING = '0ac1b13b-acbf-4246-bed4-8f0c2a8b2546'; // UUID.VICTOR_FOKIN

    const created = await I.executeAsyncScript(function (NEW_ID, USER_THING, done) {
        // Persist a session into Capacitor Preferences (native storage used by
        // the auth store in standalone mode), then create a class via the app's
        // own local API and confirm it returns at the top of the dashboard
        // search (sorted by updated desc) with the current user as owner.
        const persist = (prefs) => prefs && prefs.set
            ? prefs.set({ key: 'user', value: JSON.stringify({
                id: 1, name: 'Victor Fokin', thing_id: USER_THING,
            }) }).then(() => prefs.set({ key: 'auth_token', value: 'local-token' }))
            : Promise.resolve();

        const prefs = window.Capacitor?.Plugins?.Preferences;
        persist(prefs)
            .then(() => window.axios.post(`/object/${NEW_ID}`, {
                name: 'Собака',
                type: 2, // G_CLASS
                public: 1,
            }))
            .then((res) => ({
                thing_id: res.data.data.thing_id,
                owner: res.data.data.owner,
            }))
            .then((createdObj) =>
                window.axios.post('/object', {}).then((search) => {
                    createdObj.topIds = search.data.things.map(t => t.thing_id);
                    return createdObj;
                }))
            .then((result) => done(result))
            .catch((e) => done({ error: String(e?.message || e) }));
    }, NEW_ID, USER_THING);

    if (created.error) {
        throw new Error('Local create failed: ' + created.error);
    }
    I.say(`Created ${created.thing_id} owner=${created.owner}`);
    if (created.owner !== USER_THING) {
        throw new Error(`Expected owner=${USER_THING}, got ${created.owner} — created object is not editable by the current user`);
    }
    if (created.topIds[0] !== NEW_ID) {
        throw new Error(`Expected ${NEW_ID} at the top of search, got ${created.topIds[0]}`);
    }
    I.say('✓ Locally-created class appears at the top and is owned by the current user (editable)');
}).tag('@smoke');
