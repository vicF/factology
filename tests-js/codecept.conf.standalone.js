// factology/tests-js/codecept.conf.standalone.js
// E2E tests against the standalone (capacitor/dist-capacitor) build.
// No API server — all data comes from local Dexie DB.
const isHeadless = process.env.CI === 'true' || process.env.HEADLESS !== 'false';

exports.config = {
    tests: './e2e/**/*_test.js',
    output: './output',
    helpers: {
        Playwright: {
            url: process.env.STANDALONE_URL || 'http://localhost:4173',
            show: !isHeadless,
            browser: 'chromium',
            waitForNavigation: 'networkidle0',
            waitForTimeout: 30000,
            waitForAction: 2000,
            getPageTimeout: 60000,
            chromium: {
                args: isHeadless ? [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ] : []
            },
            recordConsole: true,
            on: {
                console: (msg) => {
                    console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
                },
                pageerror: (error) => {
                    console.log(`[BROWSER ERROR]: ${error.message}`);
                }
            }
        },
        REST: { endpoint: 'http://localhost:8005' },
    },
    include: {
        I: './steps_file.js'
    },
    plugins: {
        screenshotOnFail: { enabled: true },
        pauseOnFail: {
            enabled: !process.env.CI
        },
    },
    name: 'factology-standalone'
};
