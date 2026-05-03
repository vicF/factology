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

    I.waitForElement('.user-dropdown button', 10);
    I.click('.user-dropdown button');

    I.waitForElement('.dropdown-menu', 5);
    I.click('a.dropdown-item[href="/register"]');

    I.waitForElement('input[name="name"]', 10);
    I.fillField('Name', userData.name);
    I.fillField('Email', userData.email);
    I.fillField('Password', userData.password);
    I.fillField('Confirm Password', userData.password);

    I.click('button[type="submit"]');

    I.waitForElement('.user-dropdown button', 15);
    I.see(userData.name, '.user-dropdown button');

    testUser = userData;

    // Wait for the main content area to load
    I.waitForElement('.col-9', 15);

    // Navigate to Something
    I.waitForElement('.col-3 a', 15);
    I.click('Something');

    I.waitForText('Create', 15);
    I.wait(2);

    // Simple button selector - avoid :has-text()
    I.click('[title="Edit this object"]');

    I.waitForElement('.modal', 5);
    I.click('.modal button:has-text("Close")');

    I.waitForInvisible('.modal', 5);

    I.click('[title="Create"]');

    I.waitForElement('.modal', 5);
    I.click('.modal button:has-text("Close")');

    // Logout
    I.click('.user-dropdown button');
    I.waitForElement('.dropdown-menu', 5);
    I.click('Logout');

    // Login with same user
    I.click('.user-dropdown button');
    I.waitForElement('.dropdown-menu', 5);
    I.click('Log in');

    I.fillField('Email', testUser.email);
    I.fillField('Password', testUser.password);
    I.click('Log in');

    I.waitForElement('.user-dropdown button', 10);
    I.see(testUser.name, '.user-dropdown button');

    // Final logout
    I.click('.user-dropdown button');
    I.waitForElement('.dropdown-menu', 5);
    I.click('Logout');
});
