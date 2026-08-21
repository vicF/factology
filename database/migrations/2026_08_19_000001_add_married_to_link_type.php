<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Add the "is married to" (spouse) link type to the Kinship category.
 *
 * The Kinship base (Родственные отношения) had parents/step-parents/
 * relatives but no spouse relation, so "married to" never appeared in the
 * link-type picker.
 */
return new class extends Migration
{
    private const KINSHIP    = 'b04d6a70-fb73-4ccf-badc-a7b1a9ff3dde';
    private const MARRIED_TO = '98796ce9-e32a-4638-8d3f-db5a4e4d80e3';
    private const LINK_TO_PARENT = '361c19af-c011-4051-9329-49c75d1ca0fb';

    private const SYSTEM_OWNER = 'aaaaaaaa-0000-4000-a000-00000000000a';
    private const SERVER_UUID  = 'ef59acea-ab50-47c0-bee1-2b01d7381f76';

    public function up(): void
    {
        DB::table('things')->insertOrIgnore([
            'thing_id'                 => self::MARRIED_TO,
            'name'                     => 'is married to',
            'type'                     => \Fokin\Facts\Data\UUID::G_LINK,
            'description'              => 'Состоит в браке',
            'public'                   => true,
            'abstract'                 => false,
            'owner'                    => self::SYSTEM_OWNER,
            'server_uuid'              => self::SERVER_UUID,
            'name_translations'        => json_encode(['lang' => 'en', 'ru' => 'состоит в браке с']),
            'description_translations' => json_encode(['lang' => 'en', 'ru' => 'Состоит в браке (супруг/супруга)']),
            'data'                     => json_encode(['properties' => []]),
        ]);

        $this->addParentOf(self::KINSHIP, self::MARRIED_TO);
    }

    public function down(): void
    {
        DB::table('links')
            ->where('one_thing_id', self::KINSHIP)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', self::MARRIED_TO)
            ->update(['deleted' => true]);
        DB::table('things')->where('thing_id', self::MARRIED_TO)->delete();
    }

    private function addParentOf(string $parent, string $child): void
    {
        if (!$this->thingExists(self::LINK_TO_PARENT)
            || !$this->thingExists($parent)
            || !$this->thingExists($child)) {
            return;
        }
        $parentName = $this->linkName($parent);
        $childName  = $this->linkName($child);
        DB::table('links')->insertOrIgnore([
            'link_uuid'      => (string) \Illuminate\Support\Str::uuid(),
            'one_thing_id'   => $parent,
            'link_type_id'   => self::LINK_TO_PARENT,
            'other_thing_id' => $child,
            'public'         => true,
            'translation'    => "\"{$childName}\" is subclass of \"{$parentName}\"",
        ]);
    }

    private function linkName(string $uuid): string
    {
        return DB::table('things')->where('thing_id', $uuid)->value('name') ?? $uuid;
    }

    private function thingExists(string $uuid): bool
    {
        return DB::table('things')->where('thing_id', $uuid)->exists();
    }
};
