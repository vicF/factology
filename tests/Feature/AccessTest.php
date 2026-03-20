<?php

namespace Tests\Feature;

use Tests\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;

class AccessTest extends TestCase
{
    public static function urlDataProvider(): array
    {
        return [
            ['/', 200],
            //['/photos', 302],
            ['/timeline', 200],
            ['/classes', 200],
            ['/object/939cd822-9e23-450c-8c5e-c23f67cca792', 200], // Anything class
            //['/object/939cd822-eeee-v50c-8c5e-c23f67cca792', 404],
        ];
    }

    #[DataProvider('urlDataProvider')]
    public function testBasicTest(string $url, int $code = 200): void
    {
        $response = $this->get($url);
        self::assertEquals($code, $response->getStatusCode(), "Expecting to get $code response");
        //$response->assertStatus(200, $response->getContent());
    }
}
