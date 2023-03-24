<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DatabaseTest extends TestCase
{
    use RefreshDatabase;
    /**
     * Just a simple check that some query works, i.e. database exists
     */
    public function testSomeQuery()
    {
        try {
            $res = DB::table('photo_files')->limit(1)->get()->toArray();
        } catch (\Doctrine\DBAL\Driver\PDO\Exception $e) {
            $base = Config::get('database.default');
            $this->fail('Failed to connect to database ' . print_r(Config::get('database.connections')[$base], 1) . "\n" . $e);
        }
        $this->assertIsArray($res);
    }
}