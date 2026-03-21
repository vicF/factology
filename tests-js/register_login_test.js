// tests-js/register_login_test.js
Feature('User Registration and Login');

let testUser = null;

Before(async ({ I }) => {
    // Check database status first
    const status = await I.sendGetRequest('/api/test/status');
    console.log('Database status:', status.data);

    // Clean all test data
    await I.sendPostRequest('/api/test/clean-all');
});

After(async ({ I }) => {
    // Clean up after test
    if (testUser && testUser.id) {
        await I.sendDeleteRequest(`/api/test/users/${testUser.id}`);
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
    I.waitForText(userData.name, 15000);

    // Store for cleanup
    testUser = userData;

    I.waitForText('Something', 15000);
    // Continue with test...
    I.waitForInvisible('text=Loading...', 10000);
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

// Optional: Test the reset functionality
Scenario('Test database reset', async ({ I }) => {
    // Reset entire database
    const response = await I.sendPostRequest('/api/test/reset');
    I.assertEqual(response.status, 200);
    console.log('Database reset output:', response.data.output);
});
