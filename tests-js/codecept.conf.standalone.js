// factology/tests-js/codecept.conf.standalone.js
// CodeceptJS config for the standalone (local DB, no API) build.
// The standalone SPA is served by `vite preview` on port 4173.
const isHeadless = process.env.CI === 'true' || process.env.HEADLESS === 'true';

exports.config = {
    tests: './standalone/*_test.js',
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
        }
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
