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

Scenario('Create, move, and delete object hierarchy', async ({ I }) => {

    async function createClass(parent, name, description) {
        I.say(`Creating class: ${name} under ${parent}`);
        await I.addChildTo(parent);
        I.waitForElement('input[name="name"]', 10);
        await I.fillFieldWithRetry('input[name="name"]', name);
        await I.fillFieldWithRetry('input[name="description"]', description);
        I.click('Save');
        I.waitForInvisible('.modal', 10);
        I.waitForInvisible('.modal-backdrop', 10);
        I.waitForElement(`a:has-text("${name}")`, 15);
    }

    async function moveClassTo(className, newParentName) {
        I.say(`Moving ${className} to ${newParentName}`);
        I.click(className);
        I.waitForText(className, 20);

        I.click('[title="Edit this object"]');
        I.waitForElement('.modal', 10);

        const parentInput = locate('input').inside(locate('.object-field').withDescendant('.form-label').withText('Parent'));
        I.click(parentInput);
        I.fillField(parentInput, newParentName);

        const dropdownHook = `.dropdown-item[data-test-name="${newParentName}"]`;
        I.waitForElement(dropdownHook, 10);
        I.click(dropdownHook, null, { force: true });

        I.waitForValue(parentInput, newParentName, 10);

        I.click('.modal button:has-text("Update")');
        I.waitForInvisible('.modal', 10);
        I.waitForInvisible('.modal-backdrop', 10);

        I.click('Something');
        I.wait(1);
    }

// Update the deleteClass function in create_delete_classes_test.js
    async function deleteClass(name) {
        I.say(`Deleting class: ${name}`);
        I.click(name);
        I.waitForText(name, 20);

        // Try multiple possible selectors for delete button
        // On the object detail page, the delete button might be a button with text "Delete"
        I.waitForElement('button:has-text("Delete"), .btn-danger, [title="Delete"], .delete-btn', 15);
        I.click('button:has-text("Delete")');

        I.amAcceptingPopups();
        I.waitForDetached(`a:has-text("${name}")`, 20);
        I.dontSee(name);
    }

    // Wait for main content to load
    I.waitForElement('[data-testid="desktop-view"], [data-testid="mobile-view"]', 15);
    I.waitForElement('.col-3 a:has-text("Something")', 15);

    // 1. Build initial structure
    await createClass('Something', 'Material Object', 'Physical thing');
    await createClass('Material Object', 'Live being', 'Живое существо');
    await createClass('Live being', 'Human being', 'Человек');
    await createClass('Something', 'Dog', 'Woof woof');

    // 2. Move Dog under Human being
    await moveClassTo('Dog', 'Human being');

    I.click('Human being');
    I.waitForElement(`a:has-text("Dog")`, 10);
    I.see('Dog');

    // 3. Move Dog under Live being
    await moveClassTo('Dog', 'Live being');

    I.click('Live being');
    I.see('Dog');

    const humanBranch = locate('li').withText('Human being');
    I.dontSeeElement(locate('a').withText('Dog').inside(humanBranch));

    // 4. Cleanup hierarchy
    await deleteClass('Dog');
    await deleteClass('Human being');
    await deleteClass('Live being');
    await deleteClass('Material Object');

    // 5. Final check
    I.waitForText('Something', 20);
    I.dontSee('Dog');
    I.dontSee('Human being');
    I.dontSee('Live being');
    I.dontSee('Material Object');
});
