// tests-js/e2e/acceptance/create_delete_classes_test.js
const DB_HELPER = require('../../helpers/dbHelper');

Feature('Object Hierarchy Management');

const TEST_USER = {
    name: 'Test User',
    email: 'test@test.com',
    password: 'qqqqqqqq'
};

// Reset database before all tests (silent mode)
BeforeSuite(async ({ I }) => {
    await DB_HELPER.resetDatabase(I, { silent: true, showOutput: false });
});

// Login before each test
Before(async ({ I }) => {
    await DB_HELPER.login(I, TEST_USER);
});

Scenario('Create object hierarchy with parent-child relationships', async ({ I }) => {
    // Create Material Object
    await I.addChildTo('Something');
    await I.createClass('Material Object', 'Physical thing');

    I.seeElement('a:has-text("Material Object")');
    I.see('Material Object');

    // Verify on detail page
    I.click('Material Object');
    I.waitForText('Physical thing', 10);
    I.see('Physical thing');
    I.see('Material Object');
    I.click('Something');

    // Create Live being as child of Material Object
    await I.addChildTo('Material Object');
    await I.createClass('Live being', 'Живое существо');
    I.seeElement('a:has-text("Live being")');
    I.see('Live being');

    // Verify description on the object page
    I.click('Live being');
    I.waitForText('Живое существо', 10);
    I.see('Живое существо');
    I.see('Live being');
    I.click('Something');

    // Create Human being as child of Live being
    await I.addChildTo('Live being');
    await I.createClass('Human being', 'Человек');
    I.seeElement('a:has-text("Human being")');
    I.see('Human being');

    // Verify description on the object page
    I.click('Human being');
    I.waitForText('Человек', 10);
    I.see('Человек');
    I.see('Human being');
    I.click('Something');

    // Delete Human being
    I.click('Human being');
    I.waitForText('Human being', 10);
    I.click('Delete');
    I.acceptPopup();
    I.waitForText('Link', 15);
    I.dontSee('Human being');

    // Delete Live being
    I.click('Live being');
    I.waitForText('Live being', 10);
    I.click('Delete');
    I.acceptPopup();
    I.waitForText('Link', 15);
    I.dontSee('Live being');
    I.see('Material Object');

    // Delete Material Object
    I.click('Material Object');
    I.waitForText('Material Object', 10);
    I.click('Delete');
    I.acceptPopup();
    I.waitForText('Link', 15);
    I.dontSee('Material Object');
});

Scenario('Verify deleted objects are not visible in search', async ({ I }) => {
    // Create a temporary object
    await I.addChildTo('Something');

    I.waitForElement('input[name="name"]', 10);
    await I.fillFieldWithRetry('input[name="name"]', 'Temp Object To Delete');
    await I.fillFieldWithRetry('input[name="description"]', 'This will be deleted');
    I.click('Save');
    I.wait(2);

    I.click('Something');
    I.waitForText('Temp Object To Delete', 15);
    I.see('Temp Object To Delete');

    I.click('Temp Object To Delete');
    I.waitForText('This will be deleted', 10);
    I.see('This will be deleted');
    I.click('Something');

    I.click('Temp Object To Delete');
    I.waitForText('Temp Object To Delete', 10);
    I.click('Delete');
    I.acceptPopup();

    I.waitForText('Link', 15);
    I.dontSee('Temp Object To Delete');
});
