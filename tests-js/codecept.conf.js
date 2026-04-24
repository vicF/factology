// factology/tests-js/codecept.conf.js
const isHeadless = process.env.CI === 'true' || process.env.HEADLESS === 'true';

exports.config = {
    tests: './**/*_test.js',
    output: './output',
    helpers: {
        Playwright: {
            url: process.env.APP_URL || 'http://localhost:8005',
            show: !isHeadless,  // Hide browser in headless mode
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
        REST: {
            endpoint: process.env.APP_URL || 'http://localhost:8005'
        }
    },
    include: {
        I: './steps_file.js'
    },
    plugins: {
        screenshotOnFail: { enabled: true },
        pauseOnFail: { enabled: false },
    },
    name: 'factology'
};
