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
    // Navigate to the app first so localStorage is available
    I.amOnPage('/');
    I.waitForElement('[data-testid="desktop-view"], [data-testid="mobile-view"]', 15);
    // Clear stale auth from localStorage (DB was just reset, old tokens are invalid)
    I.executeScript(() => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
    });
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
        I.waitForInvisible('.modal', 20);
        I.waitForInvisible('.modal-backdrop', 20);
        I.waitForElement(`a:has-text("${name}")`, 15);
    }

    async function moveClassTo(className, newParentName) {
        I.say(`Moving ${className} to ${newParentName}`);
        I.click(`//a[normalize-space()="${className}"]`);
        I.waitForElement('.object-header', 30);

        I.click('[title="Edit this object"]');
        I.waitForElement('.modal', 10);

        const parentInput = locate('input').inside(locate('.object-field').withDescendant('.form-label').withText('Parent'));
        I.click(parentInput);
        I.fillField(parentInput, newParentName);

        const dropdownHook = `.dropdown-item[data-test-name="${newParentName}"]`;
        I.waitForElement(dropdownHook, 20);
        I.click(dropdownHook, null, { force: true });

        I.waitForValue(parentInput, newParentName, 20);

        I.click('.modal button:has-text("Update")');
        I.waitForInvisible('.modal', 20);
        I.waitForInvisible('.modal-backdrop', 20);

        I.click(`//a[normalize-space()="Something"]`);
        I.wait(1);
    }

// Update the deleteClass function in create_delete_classes_test.js
    async function deleteClass(name) {
        I.say(`Deleting class: ${name}`);
        I.click(`//a[normalize-space()="${name}"]`);
        I.waitForElement('.object-header', 30);

        // Verify delete button is present (authenticated view)
        I.waitForElement('button:has-text("Delete"), .btn-danger, [title="Delete"], .delete-btn', 15);

        I.amAcceptingPopups();
        I.click('button:has-text("Delete")');
        try {
            I.acceptPopup();
        } catch (e) {
            // Popup may already be auto-accepted
        }

        I.waitForDetached(`//a[normalize-space()="${name}"]`, 20);
        I.dontSee(name);
    }

    // Wait for main content to load
    I.waitForElement('[data-testid="desktop-view"], [data-testid="mobile-view"]', 15);
    I.waitForElement(`//a[normalize-space()="Something"]`, 15);

    // 1. Build initial structure
    await createClass('Something', 'Material Object', 'Physical thing');
    await createClass('Material Object', 'Live being', 'Живое существо');
    await createClass('Live being', 'Human being', 'Человек');
    await createClass('Something', 'Dog', 'Woof woof');

    // 2. Move Dog under Human being
    await moveClassTo('Dog', 'Human being');

    I.click(`//a[normalize-space()="Human being"]`);
    I.waitForElement(`//a[normalize-space()="Dog"]`, 10);
    I.see('Dog');

    // 3. Move Dog under Live being
    await moveClassTo('Dog', 'Live being');

    I.click(`//a[normalize-space()="Live being"]`);
    I.see('Dog');

    const humanBranch = locate('li').withText('Human being');
    I.dontSeeElement(locate('a').withText('Dog').inside(humanBranch));

    // 4. Cleanup hierarchy — navigate to root before each delete to avoid stale view
    I.click(`//a[normalize-space()="Something"]`);
    I.waitForElement('.object-header', 30);
    await deleteClass('Dog');

    I.click(`//a[normalize-space()="Something"]`);
    I.waitForElement('.object-header', 30);
    await deleteClass('Human being');

    I.click(`//a[normalize-space()="Something"]`);
    I.waitForElement('.object-header', 30);
    await deleteClass('Live being');

    I.click(`//a[normalize-space()="Something"]`);
    I.waitForElement('.object-header', 30);
    await deleteClass('Material Object');

    // 5. Final check
    I.waitForText('Something', 20);
    I.dontSee('Dog');
    I.dontSee('Human being');
    I.dontSee('Live being');
    I.dontSee('Material Object');
});

Scenario('Manage object relationships via Create, Edit, Link, Delete buttons', async ({ I }) => {

    async function createClass(parent, name, description) {
        I.say(`Creating class: ${name} under ${parent}`);
        await I.addChildTo(parent);
        I.waitForElement('input[name="name"]', 10);
        await I.fillFieldWithRetry('input[name="name"]', name);
        await I.fillFieldWithRetry('input[name="description"]', description);
        I.click('Save');
        I.waitForInvisible('.modal', 20);
        I.waitForInvisible('.modal-backdrop', 20);
        I.waitForElement(`a:has-text("${name}")`, 15);
    }

    async function createThing(name, description) {
        I.say(`Creating thing: ${name}`);
        I.waitForElement('input[name="name"]', 10);
        await I.fillFieldWithRetry('input[name="name"]', name);
        await I.fillFieldWithRetry('input[name="description"]', description);
        I.checkOption('#publicCheckbox');
        I.click('Save', { css: '.modal-footer' });
        I.waitForInvisible('.modal', 30);
        I.waitForInvisible('.modal-backdrop', 30);
        I.waitForText(name, 30);
    }

    async function deleteObject(name) {
        I.say(`Deleting object: ${name}`);
        I.waitForElement('.object-header', 30);
        I.waitForElement('button:has-text("Delete")', 15);
        I.amAcceptingPopups();
        I.click('button:has-text("Delete")');
        try {
            I.acceptPopup();
        } catch (e) {
            // Popup may already be auto-accepted
        }
        I.waitForDetached(`//a[normalize-space()="${name}"]`, 20);
        I.dontSee(name);
    }

    async function navigateToThing(thingName) {
        // Things are not in the tree — search for them and click the result
        I.amOnPage(`/?q=${encodeURIComponent(thingName)}`);
        I.waitForElement('[data-testid="desktop-view"], [data-testid="mobile-view"]', 15);
        I.waitForInvisible('.spinner-border', 15);
        I.waitForElement(locate('.result-item a').withText(thingName), 30);
        I.click(locate('.result-item a').withText(thingName));
        I.waitForElement('.object-header', 30);
    }

    // Wait for main content
    I.waitForElement('[data-testid="desktop-view"], [data-testid="mobile-view"]', 15);
    I.waitForElement(`//a[normalize-space()="Something"]`, 30);

    // ============ SETUP: Create test class and 3 objects ============
    I.say('=== SETUP: Creating test class and objects ===');
    await createClass('Something', 'Relation Test', 'Testing object relationships');

    // Reset to clean tree context: navigate to Something page before tree operations
    I.click(`//a[normalize-space()="Something"]`);
    I.waitForElement('.object-header', 30);

    // Create first object via tree
    await I.addObjectTo('Relation Test');
    await createThing('Alpha Parent', 'First test object — acts as parent');

    // Reset tree context
    I.click(`//a[normalize-space()="Something"]`);
    I.waitForElement('.object-header', 30);
    await I.addObjectTo('Relation Test');
    await createThing('Beta Child', 'Second test object — acts as child');

    // Reset tree context
    I.click(`//a[normalize-space()="Something"]`);
    I.waitForElement('.object-header', 30);
    await I.addObjectTo('Relation Test');
    await createThing('Gamma Spare', 'Third test object — for edit/delete');

    // ============ TEST 1: Link button — create a relationship ============
    I.say('=== TEST 1: Link button — create parent→child relationship ===');
    // Navigate to Alpha Parent via search (Things aren't in the tree, now public)
    await navigateToThing('Alpha Parent');

    // Click the "Link" button to open EditLinkModal
    I.click('button:has-text("Link")');
    I.waitForElement('.modal', 10);
    I.waitForElement('.modal-dialog', 5);

    // The EditLinkModal shows 3 ObjectFields: First object (pre-filled), Link type, Second object.
    // We need to select Beta Child as the Second object.
    // Click the 3rd .object-field's input to activate its dropdown
    const secondObjectInput = locate('.form-control').inside(locate('.object-field').at(3));
    I.click(secondObjectInput);
    I.wait(0.5); // wait for dropdown to open

    // Type to search for Beta Child
    I.fillField(secondObjectInput, 'Beta Child');
    I.waitForElement('.dropdown-item[data-test-name="Beta Child"]', 10);
    I.click('.dropdown-item[data-test-name="Beta Child"]', null, { force: true });
    I.wait(0.3);

    // Save the link via the modal footer
    I.click(locate('.modal-footer button').withText('Save'));
    I.waitForInvisible('.modal', 10);
    I.waitForInvisible('.modal-backdrop', 10);

    // Verify the link appears on Alpha Parent's page
    I.waitForText('Beta Child', 10);
    I.say('✓ Link created: Alpha Parent → Beta Child');

    // ============ TEST 2: Swap child and parent via Edit link ============
    I.say('=== TEST 2: Swap — exchange child and parent in the link ===');
    // Click the small "Edit" button on the link row (btn-sm inside .link-actions)
    I.click(locate('.btn-primary.btn-sm').withText('Edit'));
    I.waitForElement('.modal', 10);

    // Click the "Swap" button in the LinkedObject form
    I.click('button:has-text("Swap")');
    I.wait(0.3);
    I.say('Swap button clicked');

    // Save the swapped link
    I.click(locate('.modal-footer button').withText('Save'));
    I.waitForInvisible('.modal', 10);
    I.waitForInvisible('.modal-backdrop', 10);
    I.say('✓ Link swapped');

    // ============ TEST 3: Create button — create a pre-linked object ============
    I.say('=== TEST 3: Create button — create new object pre-linked to Beta Child ===');
    // Navigate to Beta Child via Relation Test page
    await navigateToThing('Beta Child');

    // Click the "Create" button to open EditObject with a pre-filled link to Beta Child
    I.click('button:has-text("Create")');
    I.waitForElement('.modal', 10);

    // Fill the new object form
    I.waitForElement('input[name="name"]', 10);
    await I.fillFieldWithRetry('input[name="name"]', 'Created From Button');
    await I.fillFieldWithRetry('input[name="description"]', 'Created via Create button on Beta Child page');

    // Save — creates the object and links it to Beta Child
    I.click(locate('.modal-footer button').withText('Save'));
    I.waitForInvisible('.modal', 10);
    I.waitForInvisible('.modal-backdrop', 10);

    // Verify the new linked object appears on Beta Child's page
    I.waitForText('Created From Button', 10);
    I.say('✓ New object created and linked via Create button');

    // ============ TEST 4: Edit button — rename an object ============
    I.say('=== TEST 4: Edit button — rename Gamma Spare ===');
    // Navigate to Gamma Spare via Relation Test
    await navigateToThing('Gamma Spare');

    // Click the "Edit" button
    I.click('button:has-text("Edit")');
    I.waitForElement('.modal', 10);

    // Change the name field
    I.waitForElement('input[name="name"]', 10);
    I.click('input[name="name"]');
    I.fillField('input[name="name"]', 'Gamma Renamed');

    // Click Update (edit mode shows "Update", not "Save")
    I.click(locate('.modal-footer button').withText('Update'));
    I.waitForInvisible('.modal', 10);
    I.waitForInvisible('.modal-backdrop', 10);

    // Verify the name changed
    I.waitForText('Gamma Renamed', 10);
    I.dontSee('Gamma Spare');
    I.say('✓ Object renamed via Edit button');

    // ============ TEST 5: Delete button — remove an object ============
    I.say('=== TEST 5: Delete button — remove Alpha Parent ===');
    await navigateToThing('Alpha Parent');
    await deleteObject('Alpha Parent');
    I.say('✓ Alpha Parent deleted');

    // Navigate back to check the tree still works
    I.click(`//a[normalize-space()="Relation Test"]`);
    I.waitForElement('.object-header', 30);
    I.say('✓ Tree navigation still works after deletion');

    // ============ CLEANUP: Remove remaining test data ============
    I.say('=== CLEANUP ===');

    // Created From Button is linked to Beta Child, navigate via Beta Child's page
    await navigateToThing('Beta Child');
    I.waitForElement(locate('.result-item a').withText('Created From Button'), 15);
    I.click(locate('.result-item a').withText('Created From Button'));
    I.waitForElement('.object-header', 30);
    await deleteObject('Created From Button');

    // Gamma Renamed still exists (Alpha Parent was already deleted in TEST 5)
    await navigateToThing('Gamma Renamed');
    await deleteObject('Gamma Renamed');

    // Delete Beta Child
    await navigateToThing('Beta Child');
    await deleteObject('Beta Child');

    // Delete the Relation Test class itself
    I.click(`//a[normalize-space()="Relation Test"]`);
    I.waitForElement('.object-header', 30);
    await deleteObject('Relation Test');

    // Navigate to Something page for final verification
    I.click(`//a[normalize-space()="Something"]`);
    I.waitForElement('.object-header', 30);

    // Final check: only base classes remain
    I.waitForText('Something', 20);
    I.dontSee('Relation Test');
    I.say('✓ All test data cleaned up');
});
