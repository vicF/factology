<?php

declare(strict_types=1);


namespace Tests\Acceptance;

use Codeception\Lib\Actor\Shared\Retry;
use Tests\Support\AcceptanceTester;

final class FirstCest
{
    //use Retry;
    public function _before(AcceptanceTester $I)
    {
        $I->executeInSelenium(function (\Facebook\WebDriver\Remote\RemoteWebDriver $driver) {
            $driver->manage()->deleteAllCookies();
        });
        //$I->retry(5, 1000);
    }

    public function tryToTest(AcceptanceTester $I): void
    {
        $I->amOnPage('/');
        $I->see('Home');
        $I->see('Login');
        $I->amOnPage('/object/d591f9d2-686a-4749-98c3-8fc6bb9d34da'); // Private object
        $I->retrySee('Login');
        $I->fillField('email', 'tester@mail.ru');
        $I->fillField('password', 'qqqqqqq');

        // Submit the form
        $I->retryClick('button[type="submit"]');
        $I->retryDontSee('Login');
        $I->see('tester');
    }
}
