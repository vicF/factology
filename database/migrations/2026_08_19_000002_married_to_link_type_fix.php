<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Resolve the "married to" duplication.
 *
 * The user's original "Married to" link type (eb8fbbab, ru "В браке с") had
 * been created as a CLASS (things.type = 2), so it never appeared in the
 * link-type picker (which filters type = G_LINK). 2026_08_19_000001 then
 * added a second "is married to" (98796ce9, ru "состоит в браке с"), leaving
 * two look-alike entries.
 *
 * Fix: convert eb8fbbab to a real link type (type = G_LINK) under the Kinship
 * base (it was hanging directly under Link), and drop the unused duplicate.
 */
return new class extends Migration
{
    private const MARRIED_TO     = 'eb8fbbab-1f92-42e6-b878-0519b9652ab6'; // "Married to" / "В браке с"
    private const MARRIED_TO_DUP = '98796ce9-e32a-4638-8d3f-db5a4e4d80e3'; // "is married to" (unused duplicate)
    private const KINSHIP        = 'b04d6a70-fb73-4ccf-badc-a7b1a9ff3dde';
    private const LINK           = '4b27fd0c-d8be-425c-a529-2186b2589e76';
    private const LINK_TO_PARENT = '361c19af-c011-4051-9329-49c75d1ca0fb';

    public function up(): void
    {
        // 1. Turn the pre-existing "Married to" class into a link type.
        DB::table('things')->where('thing_id', self::MARRIED_TO)->update([
            'type'     => \Fokin\Facts\Data\UUID::G_LINK,
            'abstract' => false,
        ]);

        // 2. Re-parent it from Link root → Kinship.
        DB::table('links')
            ->where('one_thing_id', self::LINK)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', self::MARRIED_TO)
            ->update(['deleted' => true]);
        $this->addParentOf(self::KINSHIP, self::MARRIED_TO);

        // 3. Remove the unused duplicate link type.
        DB::table('links')
            ->where('one_thing_id', self::KINSHIP)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', self::MARRIED_TO_DUP)
            ->update(['deleted' => true]);
        DB::table('things')->where('thing_id', self::MARRIED_TO_DUP)->delete();
    }

    public function down(): void
    {
        // Restore the duplicate (best-effort).
        DB::table('things')->insertOrIgnore([
            'thing_id' => self::MARRIED_TO_DUP,
            'name'     => 'is married to',
            'type'     => \Fokin\Facts\Data\UUID::G_LINK,
            'public'   => true,
            'abstract' => false,
        ]);
        $this->addParentOf(self::KINSHIP, self::MARRIED_TO_DUP);

        // Move Married to back under Link and back to a class.
        DB::table('links')
            ->where('one_thing_id', self::KINSHIP)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', self::MARRIED_TO)
            ->update(['deleted' => true]);
        $this->addParentOf(self::LINK, self::MARRIED_TO);
        DB::table('things')->where('thing_id', self::MARRIED_TO)->update([
            'type' => \Fokin\Facts\Data\UUID::G_CLASS,
        ]);
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
