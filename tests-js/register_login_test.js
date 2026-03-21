// register_login_test.js
Feature('User Registration and Login');

const testUser = {
    name: 'Tester',
    email: `tester-${Date.now()}@test.com`,
    password: 'qqqqqqqq'
};

// Remove Before/After since cleanup endpoint doesn't exist
// Just use unique email each time

Scenario('Complete registration and login flow', ({ I }) => {
    // Registration
    I.amOnPage('/');
    I.click('User');
    I.click('Register');

    I.fillField('Name', testUser.name);
    I.fillField('Email', testUser.email);
    I.fillField('Password', testUser.password);
    I.fillField('Confirm Password', testUser.password);
    I.click('Register');

    // FOR SPA: Wait for element that appears after successful registration
    // Instead of waitForNavigation, wait for the user name to appear in navbar
    I.waitForText(testUser.name, 15000);
    I.see(testUser.name);

    // Now wait for the "Something" link to be ready
    // Wait for loading indicator to disappear first
    I.waitForInvisible('text=Loading...', 10000);

    // Wait for content to load via XHR
    I.waitForText('Something', 15000);
    I.click('Something');

    // Wait for the next page to load (wait for a known element)
    I.waitForText('Create', 15000);

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

