Feature('Debug');

Scenario('Check page content @all', async ({ I }) => {
    // Capture console logs
    I.executeScript(() => {
        window.__logs = [];
        const originalError = console.error;
        console.error = function(...args) {
            window.__logs.push(['error', ...args]);
            originalError.apply(console, args);
        };
    });

    I.amOnPage('/');
    I.wait(5);

    // Get page HTML
    const html = await I.grabHTMLFrom('body');
    console.log('Page HTML length:', html.length);
    console.log('First 500 chars:', html.substring(0, 500));

    // Get console errors
    const logs = await I.executeScript(() => window.__logs);
    console.log('Console errors:', JSON.stringify(logs, null, 2));

    // Check if Vue is mounted
    const hasApp = await I.executeScript(() => !!document.getElementById('app')?.__vue_app__);
    console.log('Vue mounted:', hasApp);

    // Take screenshot
    I.saveScreenshot('debug-page.png');
});
