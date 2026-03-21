// tests-js/codecept.conf.js
exports.config = {
    tests: './**/*_test.js',
    output: './_output',
    helpers: {
        Playwright: {
            url: 'http://localhost:8005',
            show: true,
            browser: 'chromium',
            waitForNavigation: 'networkidle0',
            waitForAction: 500,
            chromium: {
                args: ['--no-sandbox']
            },
            retry: {
                steps: 3,
                minTimeout: 1000
            },
        },
        REST: {
            endpoint: 'http://localhost:8005'
        }
    },
    include: {
        I: './steps_file.js'
    },
    name: 'factology'
};
