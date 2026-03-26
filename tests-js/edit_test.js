// tests-js/edit_test.js
const { I } = inject();

Feature('Authenticated User Actions');

let testUser = null;

// Create users once before all tests
BeforeSuite(async ({ I }) => {
    console.log('=== Creating test users via API ===');

    // Create a regular user via API (this works)
    testUser = await I.createUserViaAPI({
        name: `RegularUser-${Date.now()}`,
        email: `regular-${Date.now()}@test.com`,
        password: 'password123'
    });

    console.log('✓ Test user created:', testUser.email);
});

// Login via UI before each test that needs authentication
Before(async ({ I }) => {
    // Login via UI using the API-created user
    I.amOnPage('/');
    I.click('User');
    I.click('Log in');

    I.fillField('#email', testUser.email);
    I.fillField('#password', 'password123');
    I.click('Log in');

    // Wait for login to complete
    I.waitForText(testUser.name, 10);
});


/*Scenario('User can edit their profile', async ({ I }) => {
    // Already logged in from Before hook

    // Navigate to profile
    I.click(testUser.name);
    I.click('Profile');
    I.waitForElement('.profile-form', 10);

    // Edit profile
    const newName = `UpdatedName-${Date.now()}`;
    I.fillField('#name', newName);
    I.click('Save');

    // Verify update
    I.waitForText('Profile updated', 10);
    I.see(newName);

    // Update stored user name for logout
    testUser.name = newName;
});*/

Scenario('User can logout and login again', async ({ I }) => {
    // Already logged in from Before hook

    // Logout
    I.click(testUser.name);
    I.click('Logout');
    I.waitForText('User', 10);

    // Login again
    I.click('User');
    I.click('Log in');
    I.fillField('#email', testUser.email);
    I.fillField('#password', 'password123');
    I.click('Log in');

    // Verify login success
    I.waitForText(testUser.name, 10);
});
