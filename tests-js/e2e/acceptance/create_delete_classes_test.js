// tests-js/e2e/acceptance/create_delete_classes_test.js
const DB_HELPER = require('../../helpers/dbHelper');

Feature('Object Hierarchy Management');

const TEST_USER = {
    name: 'Test User',
    email: 'test@test.com',
    password: 'qqqqqqqq'
};

BeforeSuite(async ({ I }) => {
    await DB_HELPER.resetDatabase(I, { silent: true, showOutput: false });
});

Before(async ({ I }) => {
    await DB_HELPER.login(I, TEST_USER);
});

Scenario('Create and delete object hierarchy', async ({ I }) => {
    // ----- Helper to create a class under a given parent -----
    async function createClass(parent, name, description) {
        await I.addChildTo(parent);
        I.waitForElement('input[name="name"]', 10);
        await I.fillFieldWithRetry('input[name="name"]', name);
        await I.fillFieldWithRetry('input[name="description"]', description);
        I.click('Save');
        I.waitForInvisible('.modal', 10);
        I.waitForInvisible('.modal-backdrop', 10);
        I.waitForElement(`a:has-text("${name}")`, 15);
        I.see(name);
    }

    // ----- Helper to delete a class by its name -----
    async function deleteClass(name) {
        I.click(name);
        I.waitForText(name, 20);
        I.waitForElement('button:has-text("Delete")', 15);
        I.amAcceptingPopups();
        I.click('button:has-text("Delete")');
        I.waitForDetached(`a:has-text("${name}")`, 20);
        I.dontSee(name);
    }

    // 1. Create Material Object
    await createClass('Something', 'Material Object', 'Physical thing');
    I.click('Material Object');
    I.waitForText('Physical thing', 20);
    I.see('Physical thing');
    I.click('Something');
    I.waitForElement('a:has-text("Material Object")', 15);

    // 2. Create Live being as child of Material Object
    await createClass('Material Object', 'Live being', 'Живое существо');
    I.click('Live being');
    I.waitForText('Живое существо', 20);
    I.see('Live being');
    I.click('Something');
    I.waitForElement('a:has-text("Live being")', 15);

    // 3. Create Human being as child of Live being
    await createClass('Live being', 'Human being', 'Человек');
    I.click('Human being');
    I.waitForText('Человек', 20);
    I.see('Human being');
    I.click('Something');
    I.waitForElement('a:has-text("Human being")', 15);

    // 4. Delete from leaf to root
    await deleteClass('Human being');
    await deleteClass('Live being');
    await deleteClass('Material Object');

    // Final check: only "Something" remains
    I.waitForText('Something', 20);
    I.dontSee('Material Object');
    I.dontSee('Live being');
    I.dontSee('Human being');
});
