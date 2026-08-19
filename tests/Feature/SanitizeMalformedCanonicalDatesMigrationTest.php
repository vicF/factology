<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SanitizeMalformedCanonicalDatesMigrationTest extends TestCase
{
    public function testMigrationReEncodesMalformedHugeBcCanonicals(): void
    {
        $badId = uuid_create();
        $goodId = uuid_create();
        foreach ([$badId => '-138000000000000101246060', $goodId => '20260812000000'] as $id => $start) {
            DB::table('things')->insert([
                'thing_id'    => $id,
                'name'        => 'Sanitize Row',
                'type'        => 3,
                'server_uuid' => uuid_create(),
                'start'       => $start,
            ]);
        }

        $migration = require database_path('migrations/2026_08_18_000002_sanitize_malformed_canonical_dates.php');
        $migration->up();

        $this->assertSame(
            '-138000000000000101235959',
            DB::table('things')->where('thing_id', $badId)->value('start')
        );
        // Valid canonicals are untouched.
        $this->assertSame(
            '20260812000000',
            DB::table('things')->where('thing_id', $goodId)->value('start')
        );
    }
}
