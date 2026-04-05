// tests-js/e2e/acceptance/create_delete_classes_test.js
Feature('Object Hierarchy Management');

const TEST_USER = {
    name: 'Test User',
    email: 'test@test.com',
    password: 'qqqqqqqq'
};

// Reset database before all tests
BeforeSuite(async ({ I }) => {
    console.log('\n========== DATABASE SETUP ==========');

    try {
        console.log('\n🔄 Running database reset...');
        const resetResponse = await I.sendPostRequest('/api/test/reset');

        if (resetResponse.data.success) {
            console.log('✅ Database reset successful!');
            console.log('📊 Migration Output:', resetResponse.data.output);
        } else {
            console.log('❌ Database reset failed:', resetResponse.data.error);
        }

    } catch (err) {
        console.log('\n❌ Error accessing test routes:', err.message);
        console.log('Make sure your test container is running with APP_ENV=testing');
    }

    console.log('\n====================================\n');
});

// Login before each test
Before(async ({ I }) => {
    I.amOnPage('/');
    I.seeElement('a:has-text("Home")');

    I.click('User');
    I.click('Log in');
    I.see('Log in');

    I.fillField('Email', TEST_USER.email);
    I.fillField('Password', TEST_USER.password);
    I.click('Log in');

    I.waitForText(TEST_USER.name, 15);
});

Scenario('Create object hierarchy with parent-child relationships', async ({ I }) => {
    // Create Material Object
    await I.addChildTo('Something');
    await I.createClass('Material Object', 'Physical thing');
    I.see('Material Object');

    // Verify description on the object page
    I.click('Material Object');
    I.waitForText('Physical thing', 10);
    I.see('Physical thing');
    I.click('Something');

    // Create Live being as child of Material Object
    await I.addChildTo('Material Object');
    await I.createClass('Live being', 'Живое существо');
    I.see('Live being');

    // Verify description on the object page
    I.click('Live being');
    I.waitForText('Живое существо', 10);
    I.see('Живое существо');
    I.click('Something');

    // Create Human being as child of Live being
    await I.addChildTo('Live being');
    await I.createClass('Human being', 'Человек');
    I.see('Human being');

    // Verify description on the object page
    I.click('Human being');
    I.waitForText('Человек', 10);
    I.see('Человек');
    I.click('Something');

    // Delete Human being
    I.click('Human being');
    I.waitForText('Human being', 10);
    I.click('Delete this object');
    I.acceptPopup();
    I.waitForText('Link', 15);
    I.dontSee('Human being');

    // Delete Live being
    I.click('Live being');
    I.waitForText('Live being', 10);
    I.click('Delete this object');
    I.acceptPopup();
    I.waitForText('Link', 15);
    I.dontSee('Live being');
    I.see('Material Object');

    // Delete Material Object
    I.click('Material Object');
    I.waitForText('Material Object', 10);
    I.click('Delete this object');
    I.acceptPopup();
    I.waitForText('Link', 15);
    I.dontSee('Material Object');
});

Scenario('Verify deleted objects are not visible in search', async ({ I }) => {
    // Create a temporary object
    await I.addChildTo('Something');
    await I.createClassSimple('Temp Object To Delete', 'This will be deleted');

    // Go to Something page to see the new object
    I.click('Something');
    I.waitForText('Temp Object To Delete', 15);
    I.see('Temp Object To Delete');

    // Verify description on object page
    I.click('Temp Object To Delete');
    I.waitForText('This will be deleted', 10);
    I.see('This will be deleted');
    I.click('Something');

    // Delete the object
    I.click('Temp Object To Delete');
    I.waitForText('Temp Object To Delete', 10);
    I.click('Delete');
    I.acceptPopup();

    I.waitForText('Link', 15);
    I.dontSee('Temp Object To Delete');
});
