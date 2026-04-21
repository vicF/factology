const DB_HELPER = require('../../helpers/dbHelper');

Feature('Object Hierarchy Management');

const TEST_USER = {
    name: 'Test User',
    email: 'test@test.com',
    password: 'qqqqqqqq'
};

// Reset database before all tests
BeforeSuite(async ({ I }) => {
    await DB_HELPER.resetDatabase(I, { silent: true, showOutput: false });
});

// Login before each test
Before(async ({ I }) => {
    await DB_HELPER.login(I, TEST_USER);
});

Scenario('Create object hierarchy with parent-child relationships', async ({ I }) => {
    // 1. Create Material Object
    await I.addChildTo('Something');
    await I.createClass('Material Object', 'Physical thing');

    I.waitForElement('a:has-text("Material Object")', 15);
    I.see('Material Object');

    // 2. Verify on detail page
    I.click('Material Object');
    I.waitForText('Physical thing', 20);
    I.see('Physical thing');

    I.click('Something');
    I.waitForElement('a:has-text("Material Object")', 15);

    // 3. Create Live being as child of Material Object
    await I.addChildTo('Material Object');
    await I.createClass('Live being', 'Живое существо');
    I.waitForElement('a:has-text("Live being")', 15);

    I.click('Live being');
    I.waitForText('Живое существо', 20);

    I.click('Something');
    I.waitForElement('a:has-text("Live being")', 15);

    // 4. Create Human being as child of Live being
    await I.addChildTo('Live being');
    await I.createClass('Human being', 'Человек');
    I.waitForElement('a:has-text("Human being")', 15);

    // 5. DELETE: Human being (The "Bulletproof" Sequence)
    I.click('Human being');
    I.waitForText('Human being', 20);
    I.waitForElement('button:has-text("Delete")', 15);

    // Crucial: Tell Playwright to handle the browser alert BEFORE the click
    I.amAcceptingPopups();
    I.click('button:has-text("Delete")');

    // Wait for the specific element to be purged from the DOM
    I.waitForDetached('a:has-text("Human being")', 20);
    I.dontSee('Human being');

    // 6. DELETE: Live being
    I.click('Live being');
    I.waitForText('Live being', 20);
    I.waitForElement('button:has-text("Delete")', 15);

    I.amAcceptingPopups();
    I.click('button:has-text("Delete")');

    I.waitForDetached('a:has-text("Live being")', 20);
    I.see('Material Object');

    // 7. DELETE: Material Object
    I.click('Material Object');
    I.waitForText('Material Object', 20);
    I.waitForElement('button:has-text("Delete")', 15);

    I.amAcceptingPopups();
    I.click('button:has-text("Delete")');

    I.waitForDetached('a:has-text("Material Object")', 20);
    I.waitForText('Something', 20);
});

Scenario('Verify deleted objects are not visible in search', async ({ I }) => {
    // Create a temporary object
    await I.addChildTo('Something');

    I.waitForElement('input[name="name"]', 10);
    await I.fillFieldWithRetry('input[name="name"]', 'Temp Object To Delete');
    await I.fillFieldWithRetry('input[name="description"]', 'This will be deleted');

    I.click('Save');

    // Wait for modal and backdrop to vanish
    I.waitForInvisible('.modal', 10);
    I.waitForInvisible('.modal-backdrop', 10);

    I.click('Something');
    I.waitForElement('a:has-text("Temp Object To Delete")', 20);

    I.click('Temp Object To Delete');
    I.waitForText('Temp Object To Delete', 20);
    I.waitForElement('button:has-text("Delete")', 15);

    // The "Bulletproof" Delete sequence
    I.amAcceptingPopups();
    I.click('button:has-text("Delete")');

    // Wait for the tree node to vanish
    I.waitForDetached('a:has-text("Temp Object To Delete")', 20);
    I.dontSee('Temp Object To Delete');
});
