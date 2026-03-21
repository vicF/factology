// tests-js/register_login_test.js
Feature('User Registration and Login');

let testUser = null;

Before(async ({ I }) => {
    console.log('\n========== DATABASE SETUP ==========');

    try {
        // Check migration status first
        console.log('\n📋 Current migration status:');
        const statusResponse = await I.sendGetRequest('/api/test/migration-status');
        console.log(statusResponse.data.output);

        // Reset database with full output
        console.log('\n🔄 Running database reset...');
        const resetResponse = await I.sendPostRequest('/api/test/reset');

        if (resetResponse.data.success) {
            console.log('\n✅ Database reset successful!');
            console.log('\n📊 Migration Output:');
            console.log(resetResponse.data.output);
        } else {
            console.log('\n❌ Database reset failed:');
            console.log(resetResponse.data.error);
        }

    } catch (err) {
        console.log('\n❌ Error accessing test routes:', err.message);
        console.log('Make sure your test container is running with APP_ENV=testing');
    }

    console.log('\n====================================\n');
});

/*After(async ({ I }) => {
    // Clean up after test
    if (testUser && testUser.id) {
        await I.sendDeleteRequest(`/api/test/users/${testUser.id}`);
    }
});*/

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

