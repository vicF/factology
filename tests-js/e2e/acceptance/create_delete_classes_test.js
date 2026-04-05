// tests-js/e2e/acceptance/create_delete_classes_test.js
Feature('Object Hierarchy Management');

// Default test user
const TEST_USER = {
    name: 'Test User',
    email: 'test@test.com',
    password: 'qqqqqqqq'
};

// Login before test
Before(async ({ I }) => {
    // Login with default test user
    I.amOnPage('/');
    I.seeElement('a:has-text("Home")');

    I.click('User');
    I.click('Log in');
    I.see('Log in');

    I.fillField('Email', TEST_USER.email);
    I.fillField('Password', TEST_USER.password);
    I.click('Log in');

    // Verify login success - increase timeout to 15 seconds
    I.waitForText(TEST_USER.name, 15);
});

Scenario('Create object hierarchy with parent-child relationships', async ({ I }) => {
    // ========== Create Material Object ==========
    // Escape the '+' selector or use text
    I.click('button:has-text("+")');  // More specific selector
    // OR: I.click(locate('button').withText('+'));
    // OR: I.click('//button[text()="+"]');

    I.waitForElement('input[name="name"]', 10);
    I.seeInField('Something', 'Something');

    I.fillField('input[name="name"]', 'Material Object');
    I.fillField('input[name="description"]', 'Physical thing');
    I.click('Save');

    // Verify Material Object was created
    I.waitForText('Material Object', 15);
    I.see('Material Object');

    // ========== Create Live being as child of Material Object ==========
    I.click('Add child class below "Material Object"');
    I.waitForElement('input[name="name"]', 10);
    I.seeInField('Material Object', 'Material Object');

    I.fillField('input[name="name"]', 'Live being');
    I.fillField('input[name="description"]', 'Живое существо');
    I.click('Save');

    // Verify Live being was created
    I.waitForText('Live being', 15);
    I.see('Live being');
    I.see('Description: Живое существо');

    // ========== Create Human being as child of Live being ==========
    I.click('Add child class below "Live being"');
    I.waitForElement('input[name="name"]', 10);
    I.seeInField('Live being', 'Live being');

    I.fillField('input[name="name"]', 'Human being');
    I.fillField('input[name="description"]', 'Человек');
    I.click('Save');

    // Verify Human being was created
    I.waitForText('Human being', 15);
    I.see('Human being');
    I.see('Description: Человек');

    // ========== Verify hierarchy in search results ==========
    I.see('Description: Живое существо');
    I.see('Description: Человек');

    // ========== Delete Human being and verify it's gone ==========
    // Click on Human being to go to its page
    I.click('Human being');
    I.waitForText('Human being', 10);

    // Delete Human being
    I.click('Delete this object');

    // Handle confirmation dialog
    try {
        I.acceptPopup();
    } catch (err) {
        // If popup handling fails, try clicking confirm button
        I.click('Confirm');
    }

    I.waitForText('Link', 15);
    I.dontSee('Human being');
    I.dontSee('Description: Человек');

    // ========== Delete Live being and verify it's gone ==========
    // Go back to Live being
    I.click('Live being');
    I.waitForText('Live being', 10);

    // Delete Live being
    I.click('Delete this object');

    try {
        I.acceptPopup();
    } catch (err) {
        I.click('Confirm');
    }

    // Verify Live being is gone (but Material Object should remain)
    I.waitForText('Link', 15);
    I.dontSee('Live being');
    I.dontSee('Description: Живое существо');
    I.see('Material Object'); // Parent should still exist

    // ========== Verify Material Object still exists ==========
    I.click('Material Object');
    I.waitForText('Material Object', 10);
    I.see('Material Object');

    // ========== Delete Material Object ==========
    I.click('Delete this object');

    try {
        I.acceptPopup();
    } catch (err) {
        I.click('Confirm');
    }

    // Verify Material Object is gone
    I.waitForText('Link', 15);
    I.dontSee('Material Object');
    I.dontSee('Physical thing');
});

Scenario('Verify deleted objects are not visible in search', async ({ I }) => {
    // First, create a test object
    I.click('button:has-text("+")');
    I.waitForElement('input[name="name"]', 10);
    I.fillField('input[name="name"]', 'Temp Object To Delete');
    I.fillField('input[name="description"]', 'This will be deleted');
    I.click('Save');
    I.waitForText('Temp Object To Delete', 15);

    // Verify it appears
    I.see('Temp Object To Delete');
    I.see('Description: This will be deleted');

    // Delete the object
    I.click('Delete this object');

    try {
        I.acceptPopup();
    } catch (err) {
        I.click('Confirm');
    }

    // Wait for deletion and verify it's gone
    I.waitForText('Link', 15);
    I.dontSee('Temp Object To Delete');
    I.dontSee('Description: This will be deleted');
});
