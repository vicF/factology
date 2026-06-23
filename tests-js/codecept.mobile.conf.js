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

const DEVICE_OS = process.env.DEVICE_OS || 'android';
const APK_PATH = process.env.APK_PATH || '../android/app/build/outputs/apk/debug/app-debug.apk';
const DEVICE_NAME = process.env.DEVICE_NAME || (DEVICE_OS === 'android' ? 'emulator-5554' : 'iPhone 15');

const commonCapabilities = {
    // Wait strategy
    autoWebview: true,
    autoGrantPermissions: true,
    noReset: false,
};

const androidCapabilities = {
    ...commonCapabilities,
    platformName: 'Android',
    deviceName: DEVICE_NAME,
    app: APK_PATH,
    automationName: 'UiAutomator2',
    appPackage: 'com.factology.app',
    appActivity: 'com.factology.app.MainActivity',
    avdLaunchTimeout: 120000,
};

const iosCapabilities = {
    ...commonCapabilities,
    platformName: 'iOS',
    deviceName: DEVICE_NAME,
    app: './ios/App/build/Debug-iphonesimulator/App.app',
    automationName: 'XCUITest',
    autoAcceptAlerts: true,
};

exports.config = {
    tests: `./e2e/**/*_test.js`,
    output: './output',
    helpers: {
        Appium: {
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
