// tests-js/e2e/acceptance/register_login_test.js
const DB_HELPER = require('../../helpers/dbHelper');

Feature('User Registration and Login');

let testUser = null;
let createdUserId = null;

After(async ({ I }) => {
    if (createdUserId) {
        await DB_HELPER.deleteTestUser(I, createdUserId);
    }
});

Scenario('Complete registration and login flow', async ({ I }) => {
    const userData = {
        name: 'Tester',
        email: `tester-${Date.now()}@test.com`,
        password: 'qqqqqqqq'
    };

    // Register via UI
    I.amOnPage('/');

    I.waitForElement('[data-testid="user-dropdown-btn"]', 10);
    I.click('[data-testid="user-dropdown-btn"]');

    I.waitForElement('[data-testid="user-dropdown-menu"]', 5);
    I.click('[data-testid="register-link"]');

    I.waitForElement('[data-testid="register-name"]', 10);
    I.fillField('[data-testid="register-name"]', userData.name);
    I.fillField('[data-testid="register-email"]', userData.email);
    I.fillField('[data-testid="register-password"]', userData.password);
    I.fillField('[data-testid="register-password-confirmation"]', userData.password);

    I.click('[data-testid="register-submit-btn"]');

    // After registration, wait for redirect to home page
    I.waitForElement('[data-testid="user-dropdown-btn"]', 20);
    I.wait(2);

    testUser = userData;

    // Verify we can see the main content
    I.seeElement('[data-testid="desktop-view"], [data-testid="mobile-view"]');

    // Logout
    I.click('[data-testid="user-dropdown-btn"]');
    I.waitForElement('[data-testid="user-dropdown-menu"]', 5);
    I.click('[data-testid="logout-link"]');
    I.wait(2);

    // Verify logout - should see logged out indicator
    I.seeElement('[data-testid="logged-out-indicator"]');

    // Login with same user
    I.click('[data-testid="user-dropdown-btn"]');
    I.waitForElement('[data-testid="user-dropdown-menu"]', 5);
    I.click('[data-testid="login-link"]');

    I.fillField('[data-testid="login-email"]', testUser.email);
    I.fillField('[data-testid="login-password"]', testUser.password);
    I.click('[data-testid="login-submit-btn"]');

    // Wait for login to complete
    I.waitForElement('[data-testid="user-dropdown-btn"]', 15);
    I.wait(2);

    // Verify logged in indicator
    I.seeElement('[data-testid="logged-in-indicator"]');

    // Final logout
    I.click('[data-testid="user-dropdown-btn"]');
    I.waitForElement('[data-testid="user-dropdown-menu"]', 5);
    I.click('[data-testid="logout-link"]');
});
