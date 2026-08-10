// factology/tests-js/codecept.mobile.conf.js
// E2E tests for native Android/iOS via Appium.
// Requires: appium, appium-uiautomator2-driver (Android), appium-xcuitest-driver (iOS)
//
// Usage:
//   npx codeceptjs run --config codecept.mobile.conf.js
//
// Platform-specific tags:
//   @android — only on Android
//   @ios    — only on iOS
//   @native — native-specific features (install, permissions)
//   @web    — skipped on native (auth, server-specific)

const path = require('path');

const DEVICE_OS = process.env.DEVICE_OS || 'android';
const APK_PATH = process.env.APK_PATH
    || path.resolve(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const DEVICE_NAME = process.env.DEVICE_NAME || (DEVICE_OS === 'android' ? 'emulator-5554' : 'iPhone 15');

// CodeceptJS helper-level options. `platform`/`app`/`device` are aliases the
// helper validates and maps into the session capabilities.
// Note: the webview context must be switched explicitly via I.switchToWeb()
// (the helper has no autoWebview support).
const androidCapabilities = {
    platform: 'Android',
    app: APK_PATH,
    device: DEVICE_NAME,
    // Appium capabilities. With appiumV2 (default true) the codeceptjs Appium
    // helper prefixes these with `appium:` automatically (except platformName).
    desiredCapabilities: {
        platformName: 'Android',
        deviceName: DEVICE_NAME,
        app: APK_PATH,
        automationName: 'UiAutomator2',
        appPackage: 'com.factology.app',
        appActivity: 'com.factology.app.MainActivity',
        noReset: false,
        avdLaunchTimeout: 120000,
    },
};

const iosCapabilities = {
    platform: 'iOS',
    app: './ios/App/build/Debug-iphonesimulator/App.app',
    device: DEVICE_NAME,
    desiredCapabilities: {
        platformName: 'iOS',
        deviceName: DEVICE_NAME,
        app: './ios/App/build/Debug-iphonesimulator/App.app',
        automationName: 'XCUITest',
        autoAcceptAlerts: true,
    },
};

exports.config = {
    tests: `./mobile/**/*_test.js`,
    output: './output',
    helpers: {
        Appium: {
            // Appium 2.x serves at the root base path (the codeceptjs default
            // of /wd/hub is Appium 1.x-style).
            host: '127.0.0.1',
            port: 4723,
            path: '/',
            ...(DEVICE_OS === 'android' ? androidCapabilities : iosCapabilities),
        },
    },
    include: {
        I: './steps_file.js',
    },
    plugins: {
        screenshotOnFail: { enabled: true },
        pauseOnFail: { enabled: !process.env.CI },
    },
    name: 'factology-mobile',
};
