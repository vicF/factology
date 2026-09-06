<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class NormalizeUnpaddedDatesMigrationTest extends TestCase
{
    public function testMigrationPadsLegacyUnpaddedDatesAndWritesPrecisionMeta(): void
    {
        $uuid = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $uuid,
            'name'        => 'Legacy Date Row',
            'type'        => 3,
            'server_uuid' => uuid_create(),
            'start'       => '2026081112',
            'end'         => '2026081122',
        ]);

        $migration = require database_path('migrations/2026_08_17_000001_normalize_unpadded_dates.php');
        $migration->up();

        $row = DB::table('things')->where('thing_id', $uuid)->first(['start', 'end', 'start_meta', 'end_meta']);
        $this->assertSame('20260811120000', $row->start);
        $this->assertSame('20260811220000', $row->end);

        $startMeta = json_decode($row->start_meta, true);
        $this->assertSame('minute', $startMeta['precision']);
        $this->assertSame('2026081112', $startMeta['original']);
        $this->assertSame('exact', $startMeta['qualifier']);
        $this->assertSame('minute', json_decode($row->end_meta, true)['precision']);
    }

    public function testMigrationIsIdempotentOnCanonicalValues(): void
    {
        $uuid = uuid_create();
        DB::table('things')->insert([
            'thing_id'    => $uuid,
            'name'        => 'Canonical Row',
            'type'        => 3,
            'server_uuid' => uuid_create(),
            'start'       => '20260811120000',
        ]);

        $migration = require database_path('migrations/2026_08_17_000001_normalize_unpadded_dates.php');
        $migration->up();

        $row = DB::table('things')->where('thing_id', $uuid)->first(['start', 'start_meta']);
        // Canonical values are already 14 digits — untouched, no meta written.
        $this->assertSame('20260811120000', $row->start);
        $this->assertNull($row->start_meta);
    }
}
