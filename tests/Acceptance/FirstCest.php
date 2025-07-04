<?php

declare(strict_types=1);


namespace Tests\Acceptance;

use Tests\Support\AcceptanceTester;

final class FirstCest
{
    public function _before(AcceptanceTester $I): void
    {
        // Code here will be executed before each test.
    }

    public function tryToTest(AcceptanceTester $I): void
    {
        $I->amOnPage('/');
        $I->see('Home');
        $I->see('Login');
        $I->amOnPage('/object/d591f9d2-686a-4749-98c3-8fc6bb9d34da'); // Private object
        $I->see('Login');
        $I->fillField('email', 'tester@mail.ru');
        $I->fillField('password', 'qqqqqqq');

        // Submit the form
        $I->click('button[type="submit"]');
        $I->dontSee('Login');
        $I->see('tester');
    }
}
