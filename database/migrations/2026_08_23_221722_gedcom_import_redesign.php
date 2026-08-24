<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const GEDCOM_CLASS = '10b04205-aecb-406d-befc-c6362f7ac9fb';
    private const IMPORTED_FROM = '7e58df61-3f99-4a82-9f0d-555a56abfb69';
    private const SOMETHING = '3e15244c-a9e1-4a91-a0ca-1c65722a64df';
    private const LINK_TO_PARENT = '361c19af-c011-4051-9329-49c75d1ca0fb';
    private const CONTAINMENT = '79762fd7-e52d-4401-8010-fda9a7e81aa0';
    private const OWNER = '0ac1b13b-acbf-4246-bed4-8f0c2a8b2546';
    private const SERVER_UUID = 'ef59acea-ab50-47c0-bee1-2b01d7381f76';
    private const G_LINK = 4;
    private const G_CLASS = 2;

    public function up(): void
    {
        // 1. Add `data` jsonb column to links table
        Schema::table('links', function (Blueprint $table) {
            $table->jsonb('data')->nullable()->after('description');
        });

        // 2. Drop source_service / source_external_id from things
        Schema::table('things', function (Blueprint $table) {
            $table->dropIndex('things_source_idx');
            $table->dropColumn('source_service');
            $table->dropColumn('source_external_id');
        });

        // 3. Create GEDCOM class (under Something)
        if (!$this->thingExists(self::GEDCOM_CLASS)) {
            DB::table('things')->insert([
                'thing_id'    => self::GEDCOM_CLASS,
                'name'        => 'GEDCOM',
                'type'        => self::G_CLASS,
                'description' => 'A GEDCOM genealogy file or other external data source',
                'public'      => true,
                'owner'       => self::OWNER,
                'server_uuid' => self::SERVER_UUID,
            ]);
        }

        // 4. Link GEDCOM class under Something
        if ($this->thingExists(self::SOMETHING) && $this->thingExists(self::GEDCOM_CLASS) && $this->thingExists(self::LINK_TO_PARENT)) {
            $existing = DB::table('links')
                ->where('one_thing_id', self::SOMETHING)
                ->where('link_type_id', self::LINK_TO_PARENT)
                ->where('other_thing_id', self::GEDCOM_CLASS)
                ->first();
            if (!$existing) {
                DB::table('links')->insert([
                    'link_uuid'     => (string) Illuminate\Support\Str::uuid(),
                    'one_thing_id'  => self::SOMETHING,
                    'link_type_id'  => self::LINK_TO_PARENT,
                    'other_thing_id' => self::GEDCOM_CLASS,
                    'public'        => true,
                ]);
            }
        }

        // 5. Create "imported from" link type
        if (!$this->thingExists(self::IMPORTED_FROM)) {
            DB::table('things')->insert([
                'thing_id'    => self::IMPORTED_FROM,
                'name'        => 'imported from',
                'type'        => self::G_LINK,
                'description' => 'Ссылка на внешний источник данных, из которого был импортирован объект',
                'public'      => true,
                'owner'       => self::OWNER,
                'server_uuid' => self::SERVER_UUID,
            ]);
        }

        // 6. Link "imported from" under Containment base
        if ($this->thingExists(self::CONTAINMENT) && $this->thingExists(self::IMPORTED_FROM) && $this->thingExists(self::LINK_TO_PARENT)) {
            $existing = DB::table('links')
                ->where('one_thing_id', self::CONTAINMENT)
                ->where('link_type_id', self::LINK_TO_PARENT)
                ->where('other_thing_id', self::IMPORTED_FROM)
                ->first();
            if (!$existing) {
                DB::table('links')->insert([
                    'link_uuid'     => (string) Illuminate\Support\Str::uuid(),
                    'one_thing_id'  => self::CONTAINMENT,
                    'link_type_id'  => self::LINK_TO_PARENT,
                    'other_thing_id' => self::IMPORTED_FROM,
                    'public'        => true,
                ]);
            }
        }
    }

    public function down(): void
    {
        // Remove "imported from" link type and its hierarchy link
        DB::table('links')
            ->where('one_thing_id', self::CONTAINMENT)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', self::IMPORTED_FROM)
            ->delete();
        DB::table('things')->where('thing_id', self::IMPORTED_FROM)->delete();

        // Remove GEDCOM class and its hierarchy link
        DB::table('links')
            ->where('one_thing_id', self::SOMETHING)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', self::GEDCOM_CLASS)
            ->delete();
        DB::table('things')->where('thing_id', self::GEDCOM_CLASS)->delete();

        // Restore source_service / source_external_id on things
        Schema::table('things', function (Blueprint $table) {
            $table->string('source_service', 50)->nullable()->after('server_uuid');
            $table->string('source_external_id', 255)->nullable()->after('source_service');
            $table->index(['owner', 'source_service', 'source_external_id'], 'things_source_idx');
        });

        // Drop `data` from links
        Schema::table('links', function (Blueprint $table) {
            $table->dropColumn('data');
        });
    }

    private function thingExists(string $uuid): bool
    {
        return DB::table('things')->where('thing_id', $uuid)->exists();
    }
};
