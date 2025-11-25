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

        // Если захотите retry — раскомментируйте трейт в AcceptanceTester и используйте так:
        $I->retry(5, 500);
    }

    public function tryToTest(AcceptanceTester $I, Scenario $scenario = null): void
    {
        $I->amOnPage('/');
        $I->see('Home');
        $I->see('Login');

        $I->amOnPage('/object/d591f9d2-686a-4749-98c3-8fc6bb9d34da');
        $I->see('Login');

        $I->fillField('email', 'tester@mail.ru');
        $I->fillField('password', 'qqqqqqq');
        $I->click('button[type="submit"]');
        $I->click(['xpath' => "/html/body/div[1]/div/div/main/div/div/div[2]/div/div/div/div/form/div[3]/button[1]"]);

        // Ждём, пока исчезнет блок логина и появится имя пользователя
        $I->waitForText('tester', 10);
        $I->dontSee('Login');
        $I->see('tester');
    }
}
