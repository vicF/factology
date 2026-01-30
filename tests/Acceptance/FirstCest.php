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
        // Reset Laravel cookies before each test
        $I->resetCookie('factology_session');
        $I->resetCookie('XSRF-TOKEN');

        // Clear browser storage safely with extra checks
        $I->executeJS("
            try {
                if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage === 'object') {
                    localStorage.clear();
                }
                if (typeof window !== 'undefined' && window.sessionStorage && typeof window.sessionStorage === 'object') {
                    sessionStorage.clear();
                }
            } catch (e) {
                // Ignore storage access errors
            }
        ");

        // Full cookie reset via WebDriver as fallback
        $I->executeInSelenium(function (\Facebook\WebDriver\Remote\RemoteWebDriver $driver) {
            $driver->manage()->deleteAllCookies();
        });

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

        $I->amGoingTo('Register a new user');

        // Open dropdown
        $I->scrollTo('#navbarDropdownMenuLink');
        $I->wait(1);
        $I->click('#navbarDropdownMenuLink');
        $I->waitForElementVisible('.dropdown-menu.show', 10);

        // Click Register in dropdown
        $I->click('Register', '.dropdown-menu');

        // Wait for register page
        $I->waitForText('Register', 10);

        // Ensure form is in view
        $I->scrollTo('.card.shadow-sm');
        $I->wait(1);

        // Fill form
        $I->fillField('name', $tempName);
        $I->fillField('email', $tempEmail);
        $I->fillField('password', $tempPassword);
        $I->fillField('password_confirmation', $tempPassword);

        // Submit registration
        $I->scrollTo('button[type="submit"].btn-primary');
        $I->wait(1);
        $I->click('button[type="submit"].btn-primary');

        // Give extra time for redirect, cookie set, and frontend auth sync
        $I->wait(5);

        // Debug: log cookies after registration
        $I->executeJS("console.log('Cookies after registration:', document.cookie);");

        $I->amGoingTo('Check that user has registered and logged in');
        // Wait for username in navbar (increased timeout)
        $I->waitForText($tempName, 40);
        $I->see($tempName);
        $I->dontSeeElement('.dropdown-item', ['text' => 'Register']);
        $I->dontSee('Login');

        // Browse home as logged-in user
        $I->amOnPage('/');
        $I->see('Home');
        $I->waitForElement('#search', 10);

        // TODO: Create temporary objects (will be added when feature is implemented)


        $I->amGoingTo('Log out user');
        // Test logout
        $I->scrollTo('#navbarDropdownMenuLink');
        $I->wait(1);
        $I->click('#navbarDropdownMenuLink');
        $I->waitForElementVisible('.dropdown-menu.show', 10);
        $I->click('Logout', '.dropdown-menu');
        $I->waitForText('Home', 10);
        $I->see('Login');
        $I->see('Register');
        $I->dontSee($tempName);

        $I->amGoingTo('Log in using recently created user');
        // Test login with the new user
        $I->click('Log in');
        $I->waitForText('Login', 10);
        $I->fillField('email', $tempEmail);
        $I->fillField('password', $tempPassword);
        $I->clickLoginButton();
        $I->waitForText($tempName, 15);
        $I->see($tempName);

        // TODO: Delete account (will be added when feature is implemented)

        $I->amGoingTo('Logout user at the end of test');
        // Final logout
        $I->scrollTo('#navbarDropdownMenuLink');
        $I->wait(1);
        $I->click('#navbarDropdownMenuLink');
        $I->waitForElementVisible('.dropdown-menu.show', 10);
        $I->click('Logout', '.dropdown-menu');
        $I->wait(1);

        // Optional: pause for manual inspection
        // $I->pause();
    }
}
