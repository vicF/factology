<?php
namespace Tests\Support;


use Codeception\Lib\Actor\Shared\Retry;

/**
 * Inherited Methods
 * @method void wantToTest($text)
 * @method void wantTo($text)
 * @method void execute($callable)
 * @method void expectTo($prediction)
 * @method void expect($prediction)
 * @method void amGoingTo($argumentation)
 * @method void am($role)
 * @method void lookForwardTo($achieveValue)
 * @method void comment($description)
 *
 * @SuppressWarnings(PHPMD)
 */
class AcceptanceTester extends \Codeception\Actor
{
    /*use AcceptanceTesterActions {
        grabFromCurrentUrl as protected traitGrabFromCurrentUrl;
    }*/
    use Retry;
    use _generated\AcceptanceTesterActions;


    public const RETRY_NUM = 8;
    public const RETRY_INTERVAL = 1000;


    /**
     * AcceptanceTester constructor.
     *
     * @param $scenario
     * @param int $userMarker
     */
    /*public function __construct($scenario = null, $userMarker = 0)
    {
        parent::__construct($scenario, $userMarker);
        $this->resetRetry();
    }*/

    public function resetRetry()
    {
        $this->retryNum = self::RETRY_NUM;
        $this->retryInterval = self::RETRY_INTERVAL;
    }

    /**
     * @param $var
     */
    public function debug($var)
    {
        codecept_debug($var);
    }

    /**
     * @param $var
     */
    public function debugBanner($var)
    {
        codecept_debug("--------------------------------------------------------------------------------");
        codecept_debug($var);
        codecept_debug("--------------------------------------------------------------------------------");
    }

    /**
     * Checks that the current page contains the given string (case-insensitive).
     *
     * You can specify a specific HTML element (via CSS or XPath) as the second
     * parameter to only search within that element.
     *
     * ``` php
     * <?php
     * $I->see('Logout');                        // I can suppose user is logged in
     * $I->see('Sign Up', 'h1');                 // I can suppose it's a signup page
     * $I->see('Sign Up', '//body/h1');          // with XPath
     * $I->see('Sign Up', ['css' => 'body h1']); // with strict CSS locator
     * ```
     *
     * Note that the search is done after stripping all HTML tags from the body,
     * so `$I->see('strong')` will return true for strings like:
     *
     *   - `<p>I am Stronger than thou</p>`
     *   - `<script>document.createElement('strong');</script>`
     *
     * But will *not* be true for strings like:
     *
     *   - `<strong>Home</strong>`
     *   - `<div class="strong">Home</strong>`
     *   - `<!-- strong -->`
     *
     * For checking the raw source code, use `seeInSource()`.
     *
     * @param string $text
     * @param array|string $selector optional
     * @return mixed|null
     * @see \Codeception\Module\WebDriver::see()
     */
    public function see(string $text, $selector = null)
    {
        return $this->retrySee($text, $selector);
    }

    public function dontSee(string $text, $selector = null)
    {
        return $this->retryDontSee($text, $selector);
    }

    /**
     * Checks that the given element exists on the page and is visible.
     * You can also specify expected attributes of this element.
     *
     * ``` php
     * <?php
     * $I->seeElement('.error');
     * $I->seeElement('//form/input[1]');
     * $I->seeElement('input', ['name' => 'login']);
     * $I->seeElement('input', ['value' => '123456']);
     *
     * // strict locator in first arg, attributes in second
     * $I->seeElement(['css' => 'form input'], ['name' => 'login']);
     * ?>
     * ```
     *
     * @param $selector
     * @param array $attributes
     * @return mixed|null
     * @throws Exception
     * @see \Codeception\Module\WebDriver::seeElement()
     */
    public function seeElement($selector, $attributes = null)
    {
        $retryNum = $this->retryNum ?? 1;
        $retryInterval = $this->retryInterval ?? 200;
        return $this->getScenario()->runStep(new \Codeception\Step\Retry('seeElement', func_get_args(), $retryNum, $retryInterval));
    }

    /**
     * Perform a click on a link or a button, given by a locator.
     * If a fuzzy locator is given, the page will be searched for a button, link, or image matching the locator string.
     * For buttons, the "value" attribute, "name" attribute, and inner text are searched.
     * For links, the link text is searched.
     * For images, the "alt" attribute and inner text of any parent links are searched.
     *
     * The second parameter is a context (CSS or XPath locator) to narrow the search.
     *
     * Note that if the locator matches a button of type `submit`, the form will be submitted.
     *
     * ``` php
     * <?php
     * // simple link
     * $I->click('Logout');
     * // button of form
     * $I->click('Submit');
     * // CSS button
     * $I->click('#form input[type=submit]');
     * // XPath
     * $I->click('//form/*[
     *
     * @param $link
     * @param null $context
     * @return mixed|null@see \Codeception\Module\WebDriver::click()
     */
    public function click($link, $context = null)
    {
        return $this->retryClick($link, $context);
    }

    /**
     * Ticks a checkbox. For radio buttons, use the `selectOption` method instead.
     *
     * ``` php
     * <?php
     * $I->checkOption('#agree');
     * ?>
     * ```
     *
     * @param $option
     * @return mixed|null
     * @see \Codeception\Module\WebDriver::checkOption()
     */
    public function checkOption($option)
    {
        return $this->retryCheckOption($option);
    }
    /**
     * Define custom actions here
     *
     * @param $text
     * @param null $selector
     * @return mixed|null
     * @throws Exception
     */
    /*public function retryScrollTo($text, $selector = null) {
        $retryNum = $this->retryNum ?? 1;
        $retryInterval = $this->retryInterval ?? 200;
        return $this->getScenario()->runStep(new \Codeception\Step\Retry('scrollTo', func_get_args(), $retryNum, $retryInterval));
    }*/

    /**
     * @param array $vars
     */
    public function pause(array $vars = []):void
    {
        $this->retry(0, 0);
        /*if (null !== $message) {
            $this->debug($message);
        }*/
        parent::pause();
        $this->resetRetry();
    }

    /**
     * @return array|mixed|null
     */
    public function getTestName()
    {
        return $this->getScenario()->current('name');
    }

    public function resetBrowser()
    {
        \Application\Model\Reporter::debug('Going to restart browser');
        $this->restartBrowser();
        \Application\Model\Reporter::debug('Restarted browser');
        $this->setCoverageCookie();
        $this->resizeWindow(1280, 1024);
    }

    public function setCoverageCookie()
    {
        try {
            if (defined('CODE_COVERAGE')) {
                \Application\Model\Reporter::debug('Enabling coverage after browser restart');
                $this->amOnPage('/');
                $this->setCookie('code_coverage', CODE_COVERAGE, ['path' => '/']);
                //$this->setCookie('XDEBUG_SESSION', 'start', ['path' => '/']);
            }
        } catch (\Throwable $e) {
            echo $e;
            \Application\Model\Reporter::debug($e);
        }
    }

    /**
     * @return $1|false|SimpleXMLElement
     */
    public function grabXML()
    {
        /*$url = $this->executeJS("return location.href");
        $cookies = $url = $this->executeJS("document.cookie");
        $arrContextOptions = stream_context_create([
            "ssl"  => [
                "verify_peer"      => false,
                "verify_peer_name" => false,
            ],
            'http' => [
                'method' => 'GET',
                //'header' => "\nCookie: auth=" . $this->grabCookie('auth'),
            ]
        ]);
        $source = file_get_contents($url, false, $arrContextOptions);*/
        $source = $this->executeJS("return document.querySelector('#webkit-xml-viewer-source-xml').innerHTML");
        /*if($this->getScenario()->current('browser') == 'chrome') {
            $source = html_entity_decode(strip_tags($source));
            $source = substr($source, strpos($source, '<RESULT'));
        }*/

        return simplexml_load_string($source);
    }

    public function grabFromCurrentUrl($uri = NULL) {
        $uri = $this->traitGrabFromCurrentUrl($uri);
        if(str_starts_with($uri, '/www')) { // Fix for RSWEB which has site path starting with "/www"
            $uri = substr($uri, 4);
        }
        return $uri;
    }

    public function clickLoginButton(): void
    {
        $this->click(['xpath' => "/html/body/div[1]/div/div/main/div/div/div[2]/div/div/div/div/form/div[3]/button[1]"]);
    }

    /**
     * @param AcceptanceTester $I
     */
    public function _failed(AcceptanceTester $I): void
    {
        if (getenv('PAUSE_ON_FAIL') === '1') {
            $this->debug('Paused on fail');
            $this->pause();
        }
    }


}
