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

Scenario('Complete registration and login flow @api', async ({ I }) => {
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

    // Verify logged in — open dropdown and check for user name
    I.click('[data-testid="user-dropdown-btn"]');
    I.waitForElement('[data-testid="user-dropdown-menu"]', 5);
    I.see('Logged in as');
    I.see(userData.name);

    // Logout — click dropdown toggle again to close, then logout
    I.click('[data-testid="logout-link"]');
    I.wait(1);

    // Verify logged out — open dropdown and see Guest Mode
    I.click('[data-testid="user-dropdown-btn"]');
    I.waitForElement('[data-testid="user-dropdown-menu"]', 5);
    I.see('Guest Mode');

    // Login with same user — force click since Bootstrap dropdown can intercept
    I.click('[data-testid="user-dropdown-btn"]');
    I.waitForElement('[data-testid="user-dropdown-menu"]', 5);
    I.click('[data-testid="login-link"]', null, { force: true });

    I.fillField('[data-testid="login-email"]', testUser.email);
    I.fillField('[data-testid="login-password"]', testUser.password);
    I.click('[data-testid="login-submit-btn"]');

    // Wait for login to complete
    I.waitForElement('[data-testid="user-dropdown-btn"]', 15);
    I.wait(1);

    // Verify logged in — open dropdown and check for user name
    I.click('[data-testid="user-dropdown-btn"]');
    I.waitForElement('[data-testid="user-dropdown-menu"]', 5);
    I.see('Logged in as');
    I.see(testUser.name);

    // Logout
    I.click('[data-testid="logout-link"]');
});
