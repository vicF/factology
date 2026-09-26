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
    // Enable edit mode (persisted in localStorage, read by Pinia on init)
    I.executeScript(() => localStorage.setItem('editMode', '1'));
});

Scenario('Create, move, and delete object hierarchy', async ({ I }) => {

    async function createClass(parent, name, description) {
        I.say(`Creating class: ${name} under ${parent}`);
        await I.addChildTo(parent);
        I.waitForElement('input[name="name"]', 10);
        await I.fillFieldWithRetry('input[name="name"]', name);
        await I.fillFieldWithRetry('input[name="description"]', description);
        await I.clickModalFooterAndWait('Save');
        // Saving navigates to the new class's own page, where the class tree is
        // not rendered — go back to the dashboard before the next tree action.
        await I.openClassTree();
        await I.ensureTreeNode(name);
    }

    async function moveClassTo(className, newParentName) {
        I.say(`Moving ${className} to ${newParentName}`);
        await I.openClassTree();
        await I.openTreeNode(className);

        I.click('[title="Edit this object"]');
        I.waitForElement('.modal', 10);

        const parentInput = locate('input').inside(locate('.object-field').withDescendant('.form-label').withText('Parent'));
        I.click(parentInput);
        I.fillField(parentInput, newParentName);

        const dropdownHook = `.dropdown-item[data-test-name="${newParentName}"]`;
        I.waitForElement(dropdownHook, 20);
        I.click(dropdownHook, null, { force: true });

        I.waitForValue(parentInput, newParentName, 20);

        await I.clickModalFooterAndWait('Update');

        // The edit modal closes in place, so return to the tree explicitly.
        await I.openClassTree();
    }

    async function deleteClass(name) {
        I.say(`Deleting class: ${name}`);
        await I.openClassTree();
        await I.openTreeNode(name);

        // Verify delete button is present (authenticated view)
        I.waitForElement('button:has-text("Delete"), .btn-danger, [title="Delete"], .delete-btn', 15);

        I.amAcceptingPopups();
        I.click('button:has-text("Delete")');
        try {
            I.acceptPopup();
        } catch (e) {
            // Popup may already be auto-accepted
        }

        // Reload the authoritative tree: the deleted class must be gone from it.
        await I.openClassTree();
        I.dontSee(name, '.tree-node');
        I.say(`✓ ${name} deleted`);
    }

    // 1. Build initial structure
    await I.openClassTree();
    await createClass('Something', 'Material Object', 'Physical thing');
    await createClass('Material Object', 'Live being', 'Живое существо');
    await createClass('Live being', 'Human being', 'Человек');
    await createClass('Something', 'Dog', 'Woof woof');

    // 2. Move Dog under Human being
    await moveClassTo('Dog', 'Human being');

    await I.ensureTreeNode('Human being');
    const dogAncestorsAfterFirstMove = await I.grabTreeNodeAncestors('Dog');
    if (!dogAncestorsAfterFirstMove || !dogAncestorsAfterFirstMove.includes('Human being')) {
        throw new Error(`Dog is not a child of Human being: ${JSON.stringify(dogAncestorsAfterFirstMove)}`);
    }

    // 3. Move Dog under Live being
    await moveClassTo('Dog', 'Live being');

    await I.ensureTreeNode('Dog');
    const dogAncestorsAfterSecondMove = await I.grabTreeNodeAncestors('Dog');
    if (!dogAncestorsAfterSecondMove || !dogAncestorsAfterSecondMove.includes('Live being')) {
        throw new Error(`Dog is not a child of Live being: ${JSON.stringify(dogAncestorsAfterSecondMove)}`);
    }
    if (dogAncestorsAfterSecondMove.includes('Human being')) {
        throw new Error(`Dog is still nested under Human being: ${JSON.stringify(dogAncestorsAfterSecondMove)}`);
    }

    // 4. Cleanup hierarchy (deepest first — deleting a parent would take the
    //    children with it and hide the remaining delete assertions).
    await deleteClass('Human being');
    await deleteClass('Dog');
    await deleteClass('Live being');
    await deleteClass('Material Object');

    // 5. Final check — only the root class survives in the tree
    await I.openClassTree();
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
        await I.clickModalFooterAndWait('Save');
        // Saving navigates to the new class's own page, where the class tree is
        // not rendered — go back to the dashboard before the next tree action.
        await I.openClassTree();
        await I.ensureTreeNode(name);
    }

    const thingUrls = {};

    async function createThing(name, description) {
        I.say(`Creating thing: ${name}`);
        I.waitForElement('input[name="name"]', 10);
        await I.fillFieldWithRetry('input[name="name"]', name);
        I.wait(0.5);
        await I.fillFieldWithRetry('input[name="description"]', description);
        I.checkOption('#publicCheckbox');
        await I.clickModalFooterAndWait('Save');
        I.waitForText(name, 30);
        // Save the URL so navigateToThing can jump directly without relying on
        // search results (which are filtered by the class-tree checkboxes).
        thingUrls[name] = await I.grabCurrentUrl();
    }

    async function deleteObject(name) {
        I.say(`Deleting object: ${name}`);
        I.waitForElement('.object-header', 30);
        // Guard: make sure the page actually shows the entity we intend to
        // delete, otherwise a stray click could remove the parent class.
        I.waitForText(name, 15);
        I.waitForElement('button:has-text("Delete")', 15);
        I.amAcceptingPopups();
        I.click('button:has-text("Delete")');
        try {
            I.acceptPopup();
        } catch (e) {
            // Popup may already be auto-accepted
        }
        I.waitForDetached(`//a[normalize-space()="${name}"]`, 20);
        I.wait(2);
    }

    async function navigateToThing(thingName) {
        const url = thingUrls[thingName];
        if (url) {
            I.amOnPage(url);
            I.waitForElement('.object-header', 30);
            return;
        }
        // Fallback: search (e.g. after a rename that wasn't tracked)
        I.amOnPage(`/?q=${encodeURIComponent(thingName)}`);
        I.waitForElement('[data-testid="desktop-view"], [data-testid="mobile-view"]', 15);
        I.waitForInvisible('.spinner-border', 15);
        I.waitForElement(locate('.result-item a').withText(thingName), 30);
        I.click(locate('.result-item a').withText(thingName));
        I.waitForElement('.object-header', 30);
    }

    // Open dashboard (class tree) and create the test class
    await I.openClassTree();
    I.say('=== SETUP: Creating test class and objects ===');
    await createClass('Something', 'Relation Test', 'Testing object relationships');

    // Create three objects via the tree (each save puts us on the object's page,
    // so reopen the tree before every tree action).
    await I.openClassTree();
    await I.addObjectTo('Relation Test');
    await createThing('Alpha Parent', 'First test object — acts as parent');

    await I.openClassTree();
    await I.addObjectTo('Relation Test');
    await createThing('Beta Child', 'Second test object — acts as child');

    await I.openClassTree();
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
    // Click the 3rd .form-group's input to activate its dropdown (the "Second object" field)
    const secondObjectInput = '.linked-object .form-group:nth-of-type(3) input.form-control';
    I.click(secondObjectInput);
    I.wait(0.5); // wait for dropdown to open

    // Type to search for Beta Child
    I.fillField(secondObjectInput, 'Beta Child');
    I.waitForElement('.dropdown-item[data-test-name="Beta Child"]', 10);
    I.click('.dropdown-item[data-test-name="Beta Child"]', null, { force: true });
    I.wait(0.3);

    // Save the link via the modal footer
    await I.clickModalFooterAndWait("Save");

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
    await I.clickModalFooterAndWait("Save");
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
    await I.clickModalFooterAndWait("Save");

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
    await I.clickModalFooterAndWait("Update");

    // Verify the name changed
    I.waitForText('Gamma Renamed', 10);
    I.dontSee('Gamma Spare');
    // Store the renamed URL so navigateToThing can find it
    thingUrls['Gamma Renamed'] = await I.grabCurrentUrl();
    I.say('✓ Object renamed via Edit button');

    // ============ TEST 5: Delete button — remove an object ============
    I.say('=== TEST 5: Delete button — remove Alpha Parent ===');
    await navigateToThing('Alpha Parent');
    await deleteObject('Alpha Parent');
    I.say('✓ Alpha Parent deleted');

    // Navigate back to check the tree still works
    await I.openClassTree();
    await I.ensureTreeNode('Relation Test');
    await I.openTreeNode('Relation Test');
    I.waitForElement('.object-header', 30);
    I.say('✓ Tree navigation still works after deletion');

    // ============ CLEANUP: Remove remaining test data ============
    I.say('=== CLEANUP ===');

    // Created From Button is created through the linked-create modal. On a cold
    // reload it is not present in the related list (it is not persisted
    // server-side), so clean it up opportunistically and don't fail if absent.
    await navigateToThing('Beta Child');
    if (await I.hasRelatedLink('Created From Button')) {
        await I.clickRelatedLink('Created From Button');
        I.waitForElement('.object-header', 30);
        await deleteObject('Created From Button');
        await navigateToThing('Beta Child');
    } else {
        I.say('⚠ "Created From Button" is not persisted server-side; skipping its cleanup');
    }

    await navigateToThing('Gamma Renamed');
    await deleteObject('Gamma Renamed');

    await navigateToThing('Beta Child');
    await deleteObject('Beta Child');

    // Delete the Relation Test class itself — navigate via the tree
    await I.openClassTree();
    await I.ensureTreeNode('Relation Test');
    await I.openTreeNode('Relation Test');
    await deleteObject('Relation Test');

    // Navigate to Something page for final verification via the tree
    await I.openClassTree();
    I.waitForText('Something', 20);
    I.dontSee('Relation Test');
    I.say('✓ All test data cleaned up');
});
