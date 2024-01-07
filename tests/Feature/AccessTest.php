<?php

namespace Tests\Feature;

use Tests\TestCase;

class AccessTest extends TestCase
{

    public function urlDataProvider()
    {
        return [
            ['/'],
            //['/photos', 302],
            ['/timeline'],
            ['/classes'],
            ['/object/939cd822-9e23-450c-8c5e-c23f67cca792'], // Anything class
            //['/object/939cd822-eeee-v50c-8c5e-c23f67cca792', 404],
        ];
    }

    /**
     * A basic test example.
     *
     * @dataProvider urlDataProvider
     * @return void
     */
    public function testBasicTest($url, $code = 200)
    {
        $response = $this->get($url);
        self::assertEquals($code, $response->getStatusCode(), "Expecting to get $code response");
        //$response->assertStatus(200, $response->getContent());
    }
}
