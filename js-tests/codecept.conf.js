// codecept.conf.cjs
exports.config = {
    tests: './*_test.js',
    output: './tests/_output',
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
            restart: false,
            keepCookies: true
        },
        REST: {
            endpoint: 'http://localhost:8005/api',
            defaultHeaders: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        }
    },
    include: {
        I: './steps_file.js'
    },
    name: 'factology'
};
