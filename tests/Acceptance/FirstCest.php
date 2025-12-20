<?php

declare(strict_types=1);

namespace Tests\Acceptance;

use Tests\Support\AcceptanceTester;
use Codeception\Scenario;

final class FirstCest
{
    //use Retry;

    public function _before(AcceptanceTester $I, Scenario $scenario = null): void
    {
        // Очищаем куки перед каждым тестом
        /*$I->executeInSelenium(function (\Facebook\WebDriver\Remote\RemoteWebDriver $driver) {
            $driver->manage()->deleteAllCookies();
        });*/

        $I->retry(5, 500);
    }



    public function testerLoginTest(AcceptanceTester $I, Scenario $scenario = null): void
    {
        $I->amGoingTo('Make sure that login is not required for a home page');
        $I->amOnPage('/');
        $I->see('Home');
        $I->waitForElement('#search', 10);
        $I->seeElement('.row.mb-3');
        $I->seeElement('#search img');  // thumbnails loaded
        $I->dontSee('Login');
        $I->amGoingTo('Make sure that login is required for a private object page');
        $I->amOnPage('/object/d591f9d2-686a-4749-98c3-8fc6bb9d34da');
        $I->see('Not Found');
        $I->amGoingTo('Log in as tester@mail.ru');
        $I->click('Log in');
        $I->fillField('email', 'tester@mail.ru');
        $I->fillField('password', 'qqqqqqq');
        $I->clickLoginButton();
        // Ждём, пока исчезнет блок логина и появится имя пользователя
        $I->waitForText('tester', 10);
        $I->dontSeeElement('a.dropdown-item', ['text' => 'Login']);
        $I->dontSeeElement('router-link', ['to' => '/login']);
        //$I->dontSee('Login');
        $I->see('tester');
        $I->waitForElement('#search', 10);
        $I->seeElement('.row.mb-3');
        $I->seeElement('#search img');  // thumbnails loaded
        #$I->dontSee('Login');
        $I->dontSeeElement('a.dropdown-item', ['text' => 'Login']);
        $I->dontSeeElement('router-link', ['to' => '/login']);
    }

    public function newUserTest(AcceptanceTester $I, Scenario $scenario = null): void {
        $I->amGoingTo('Create new temporary user, perform basic actions, and clean up (register, browse, create/delete objects, logout/login, delete account)');

        $tempEmail = 'tempuser_' . time() . '@example.com';
        $tempPassword = 'temporary123';
        $tempName = 'TempUser';

        // Start as guest
        $I->amOnPage('/');
        $I->see('Home');
        $I->waitForElement('#search', 10);

        // Open dropdown using direct Bootstrap JS (more reliable than custom function, avoids "not defined" errors)
        $I->executeJS("
            const toggle = document.querySelector('#navbarDropdownMenuLink');
            if (toggle) {
                toggle.scrollIntoView({ block: 'center' });
                const dropdown = bootstrap.Dropdown.getOrCreateInstance(toggle);
                dropdown.show();
            }
        ");

        // Wait for the dropdown menu to be visible
        $I->waitForElementVisible('.dropdown-menu.show', 10);

        // Click the Register item
        $I->click('Register', '.dropdown-menu');

        // Wait for register page and fill registration form
        $I->waitForText('Register', 10);
        $I->fillField('name', $tempName);
        $I->fillField('email', $tempEmail);
        $I->fillField('password', $tempPassword);
        $I->fillField('password_confirmation', $tempPassword);
        $I->click('Register'); // assuming button text is "Register"

        // After registration – should be logged in and redirected (usually to home)
        $I->waitForText($tempName, 15); // wait for username in navbar
        $I->see($tempName);
        $I->dontSee('Register');
        $I->dontSee('Login');

        // Browse some pages as logged-in user (example: assume a protected page or just home)
        $I->amOnPage('/');
        $I->see('Home');
        $I->waitForElement('#search', 10);

        // TODO: Create temporary objects (will be added when feature is implemented)
        // Example placeholder:
        // $I->click('Create Object');
        // $I->fillField('title', 'Temp Object 1');
        // $I->click('Save');
        // $I->see('Temp Object 1');

        // TODO: Delete created objects (when implemented)

        // Test logout
        $I->executeJS("
            const toggle = document.querySelector('#navbarDropdownMenuLink');
            if (toggle) {
                const dropdown = bootstrap.Dropdown.getOrCreateInstance(toggle);
                dropdown.show();
            }
        ");
        $I->waitForElementVisible('.dropdown-menu.show', 10);
        $I->click('Logout', '.dropdown-menu');
        $I->waitForText('Home', 10);
        $I->see('Login');
        $I->see('Register');
        $I->dontSee($tempName);

        // Test login with the new user
        $I->click('Log in');
        $I->waitForText('Login', 10);
        $I->fillField('email', $tempEmail);
        $I->fillField('password', $tempPassword);
        $I->clickLoginButton(); // reuse existing helper if available
        $I->waitForText($tempName, 15);
        $I->see($tempName);

        // TODO: Delete account (will be added when feature is implemented)
        // Example placeholder:
        // $I->executeJS('triggerDropdown("#navbarDropdownMenuLink")');
        // $I->click('Delete Account');
        // $I->acceptPopup();
        // $I->see('Account deleted');

        // Final logout (if delete not implemented yet)
        $I->executeJS("
            const toggle = document.querySelector('#navbarDropdownMenuLink');
            if (toggle) {
                const dropdown = bootstrap.Dropdown.getOrCreateInstance(toggle);
                dropdown.show();
            }
        ");
        $I->waitForElementVisible('.dropdown-menu.show', 10);
        $I->click('Logout', '.dropdown-menu');
        $I->wait(1); // small pause for cleanup

        // Optional: pause for manual inspection during development
        // $I->pause();
    }
}
