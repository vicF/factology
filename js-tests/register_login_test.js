// js-tests/e2e/acceptance/register_login_test.js
Feature('User Registration and Login');

const testUser = {
    name: 'Tester',
    email: `tester-${Date.now()}@test.com`,
    password: 'qqqqqqqq'
};

Before(async ({ I }) => {
    // Clean up any existing test user
    await I.sendPostRequest('/api/test/cleanup', { email: testUser.email });
});

Scenario('Complete user registration and login flow', ({ I }) => {
    // Register
    I.amOnPage('/');
    I.click('User');
    I.click('Register');

    I.fillField('Name', testUser.name);
    I.fillField('Email', testUser.email);
    I.fillField('Password', testUser.password);
    I.fillField('Confirm Password', testUser.password);
    I.click('Register');

    // Verify registration success
    I.see(testUser.name);


    // Create something (adjust selectors based on your app)
    I.click('Something');
    I.seeElement('button', 'Create');

    // Test dialog interactions
    I.click('Edit this object');
    I.waitForElement('.modal', 5);
    I.click('Close');

    I.click('Create');
    I.waitForElement('.modal', 5);
    I.click('Close');

    // Logout
    I.click(testUser.name);
    I.click('Logout');
    I.see('User');

    // Login
    I.click('User');
    I.click('Log in');
    I.fillField('Email', testUser.email);
    I.fillField('Password', testUser.password);
    I.click('Log in');

    // Verify login success
    I.see(testUser.name);

    // Final logout
    I.click(testUser.name);
    I.click('Logout');
    I.see('guest');
    I.see('User');
});

After(async ({ I }) => {
    // Clean up test user after test
    await I.sendPostRequest('/api/test/cleanup', { email: testUser.email });
});
