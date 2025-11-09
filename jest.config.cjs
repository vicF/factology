// jest.config.cjs
// Minimal config – makes Jest start instantly
module.exports = {
    testEnvironment: 'node',
    watchman: false,
    testMatch: ['<rootDir>/resources/js/__tests__/**/*.test.js'],
    transform: {},                     // no Babel needed (ESM)
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'     // strip .js from ESM imports
    },
    // ---- CRITICAL: ignore everything except your JS ----
    modulePathIgnorePatterns: [
        '<rootDir>/node_modules',
        '<rootDir>/vendor',
        '<rootDir>/storage',
        '<rootDir>/bootstrap',
        '<rootDir>/public',
        '<rootDir>/tests',               // ignore PHP tests
    ],
    testPathIgnorePatterns: [
        '<rootDir>/node_modules',
        '<rootDir>/vendor'
    ],
    // Speed up startup
    maxWorkers: 1,
    cache: false,
};
