<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Tests\TestCase;

class DropVarietyColumnsMigrationTest extends TestCase
{
    public function testMigrationDecodesVarietyIntoMetaFuzzAndDropsColumns(): void
    {
        // Re-add the legacy columns (only if a previous run already dropped
        // them) so the migration's decode path can be exercised.
        if (!Schema::hasColumn('things', 'start_variety')) {
            Schema::table('things', static function (Blueprint $table) {
                $table->double('start_variety')->nullable();
                $table->double('end_variety')->nullable();
            });
        }
        if (!Schema::hasColumn('links', 'link_start_variety')) {
            Schema::table('links', static function (Blueprint $table) {
                $table->decimal('link_start_variety', 10, 0)->nullable();
                $table->decimal('link_end_variety', 10, 0)->nullable();
            });
        }

        $thingId = uuid_create();
        $linkTypeId = uuid_create();
        $otherId = uuid_create();
        foreach ([$thingId => 'Variety Row', $linkTypeId => 'Link Type', $otherId => 'Other'] as $id => $name) {
            DB::table('things')->insert([
                'thing_id'    => $id,
                'name'        => $name,
                'type'        => 3,
                'server_uuid' => uuid_create(),
            ]);
        }
        DB::table('things')->where('thing_id', $thingId)->update([
            'start'         => '20260809000000',
            'start_variety' => 10000,          // → ±1 hour
            'end_variety'   => 1000000000000,  // → ±100 years
            'start_meta'    => json_encode(['precision' => 'day', 'qualifier' => 'exact']),
        ]);

        $linkId = DB::table('links')->insertGetId([
            'one_thing_id'        => $thingId,
            'link_type_id'        => $linkTypeId,
            'other_thing_id'      => $otherId,
            'link_start_variety'  => 240000,    // → ±1 day
            'link_start'          => '20260810000000',
        ], 'link_id');

        $migration = require database_path('migrations/2026_08_18_000001_drop_variety_columns.php');
        $migration->up();

        // Existing meta keys are preserved and fuzz is merged in.
        // (jsonb sorts object keys, so compare fields individually.)
        $thing = DB::table('things')->where('thing_id', $thingId)->first(['start_meta', 'end_meta']);
        $startMeta = json_decode($thing->start_meta, true);
        $this->assertSame('day', $startMeta['precision']);
        $this->assertSame('hour', $startMeta['fuzz']['unit']);
        $this->assertSame(1, $startMeta['fuzz']['value']);
        $endMeta = json_decode($thing->end_meta, true);
        $this->assertSame('year', $endMeta['fuzz']['unit']);
        $this->assertSame(100, $endMeta['fuzz']['value']);

        $link = DB::table('links')->where('link_id', $linkId)->first(['link_start_meta']);
        $linkMeta = json_decode($link->link_start_meta, true);
        $this->assertSame('day', $linkMeta['fuzz']['unit']);
        $this->assertSame(1, $linkMeta['fuzz']['value']);

        // Columns are gone.
        $this->assertFalse(Schema::hasColumn('things', 'start_variety'));
        $this->assertFalse(Schema::hasColumn('things', 'end_variety'));
        $this->assertFalse(Schema::hasColumn('links', 'link_start_variety'));
        $this->assertFalse(Schema::hasColumn('links', 'link_end_variety'));
    }
}
