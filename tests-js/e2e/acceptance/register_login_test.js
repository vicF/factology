// tests-js/register_login_test.js
const DB_HELPER = require('../../helpers/dbHelper');

Feature('User Registration and Login');

let testUser = null;
let createdUserId = null;

/*Before(async ({ I }) => {
    await DB_HELPER.resetDatabase(I, { showOutput: false });
});*/

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
    I.click('User');
    I.click('Register');

    I.fillField('Name', userData.name);
    I.fillField('Email', userData.email);
    I.fillField('Password', userData.password);
    I.fillField('Confirm Password', userData.password);
    I.click('Register');

    // Wait for successful registration
    I.waitForText(userData.name, 15);

    // Store for cleanup
    testUser = userData;
    createdUserId = testUser.id;

    I.waitForText('Something', 15);
    I.waitForInvisible('text=Loading...', 10);
    I.click('Something');

    // Wait for the next page to load
    I.waitForText('Create', 15);

    // Test dialog interactions
    I.click('Edit this object');
    I.waitForElement('.modal', 5);
    I.click('Close');

    I.click('Create');
    I.waitForElement('.modal', 5);
    I.click('Close');

    // Logout
    await DB_HELPER.logout(I, testUser.name);

    // Login with same user
    I.click('User');
    I.click('Log in');
    I.fillField('Email', testUser.email);
    I.fillField('Password', testUser.password);
    I.click('Log in');

    // Verify login success
    I.see(testUser.name);

    // Final logout
    await DB_HELPER.logout(I, testUser.name);
});
