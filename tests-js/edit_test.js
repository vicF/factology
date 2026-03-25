// tests-js/authenticated_api_test.js
const { I } = inject();

let testUser = null;

// Create users once using API (much faster)
BeforeSuite(async ({ I }) => {
    console.log('=== Creating test users via API ===');

    // Create regular user
    testUser = await I.createUserViaAPI({
        name: 'RegularUser',
        email: `regular-${Date.now()}@test.com`,
        password: 'password123'
    });

    // Create admin user
    testAdmin = await I.createUserViaAPI({
        name: 'AdminUser',
        email: `admin-${Date.now()}@test.com`,
        password: 'password123'
    });

    console.log('✓ Test users created via API');
});

// Login via API before tests
Before(async ({ I }) => {
    await I.loginViaAPI(testUser.email, testUser.password);
    I.setAuthHeader(); // Set token for subsequent requests
});

// Or use UI login if needed
Scenario('UI login with API-created user', async ({ I }) => {
    // Login via UI using the API-created user
    I.amOnPage('/');
    I.click('User');
    I.click('Log in');
    I.fillField('#email', testUser.email);
    I.fillField('#password', 'password123');
    I.click('Log in');
    I.waitForText(testUser.name, 10);
});

Scenario('User actions with token auth', async ({ I }) => {
    // Already logged in via API, token is set
    I.amOnPage('/');
    I.see(testUser.name); // Should be logged in via token
});
