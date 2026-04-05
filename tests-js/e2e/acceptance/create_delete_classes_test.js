// tests-js/e2e/acceptance/create_delete_classes_test.js
Feature('Object Hierarchy Management');

const TEST_USER = {
    name: 'Test User',
    email: 'test@test.com',
    password: 'qqqqqqqq'
};

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

    // Create Live being as child of Material Object
    await I.addChildTo('Material Object');
    await I.createClass('Live being', 'Живое существо');
    I.see('Live being');

    // Create Human being as child of Live being
    await I.addChildTo('Live being');
    await I.createClass('Human being', 'Человек');
    I.see('Human being');

    // Verify descriptions are visible
    I.see('Человек');
    I.see('Живое существо');

    // Delete Human being
    I.click('Human being');
    I.waitForText('Human being', 10);
    I.click('Delete this object');
    I.handlePopup({ accept: true });
    I.waitForText('Link', 15);
    I.dontSee('Human being');
    I.dontSee('Человек');

    // Delete Live being
    I.click('Live being');
    I.waitForText('Live being', 10);
    I.click('Delete this object');
    I.handlePopup({ accept: true });
    I.waitForText('Link', 15);
    I.dontSee('Live being');
    I.dontSee('Живое существо');
    I.see('Material Object');

    // Delete Material Object
    I.click('Material Object');
    I.waitForText('Material Object', 10);
    I.click('Delete this object');
    I.handlePopup({ accept: true });
    I.waitForText('Link', 15);
    I.dontSee('Material Object');
    I.dontSee('Physical thing');
});

Scenario('Verify deleted objects are not visible in search', async ({ I }) => {
    // Create a temporary object
    await I.addChildTo('Something');
    await I.createClass('Temp Object To Delete', 'This will be deleted');
    I.see('Temp Object To Delete');
    I.see('This will be deleted');

    // Delete it
    I.click('Temp Object To Delete');
    I.waitForText('Temp Object To Delete', 10);
    I.click('Delete this object');
    I.handlePopup({ accept: true });

    I.waitForText('Link', 15);
    I.dontSee('Temp Object To Delete');
    I.dontSee('This will be deleted');
});
