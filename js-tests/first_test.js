// first_test.js
Feature('Quick Test');

Scenario('app loads', ({ I }) => {
    I.amOnPage('/');
    I.see('Home');
});
