<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Restructure the link-type tree into standards-aligned base categories.
 *
 * Base nodes (Kind, Containment, Equivalence, Time) are ABSTRACT link types:
 * they exist purely as grouping containers in the tree, are never used as a
 * real link type, and are excluded from selectors. Concrete link types hang
 * off them via the structural "is a parent of" link.
 *
 * Also fixes `meanwhile` (b42957b9) which was stored as a CLASS (type 2)
 * though it is used as a link type (type 4).
 */
return new class extends Migration
{
    // ── New base link types ──
    private const KIND        = '733112a1-9e87-47ee-8a86-81cc38e77a41';
    private const CONTAINMENT = '79762fd7-e52d-4401-8010-fda9a7e81aa0';
    private const EQUIVALENCE = '16414472-da4b-427d-8886-b7c75d133750';
    private const TIME        = '1858e752-8df2-43ef-86c3-0d3581e522a8';
    private const FOLLOWED_BY = '41211efa-61fd-422d-b07f-7041289bc8aa';

    // ── Existing structural/link-type UUIDs (mirror of Fokin\Facts\Data\UUID) ──
    private const LINK              = '4b27fd0c-d8be-425c-a529-2186b2589e76';
    private const LINK_TO_PARENT    = '361c19af-c011-4051-9329-49c75d1ca0fb';
    private const LINK_TO_CLASS     = 'c217c185-742f-4a9f-8e69-acea2b4f5aea';
    private const PRESENT           = '8811c270-4285-4534-bb2a-c4da1ba850e4'; // "is involved in"
    private const RELATED_TO        = '2da45f14-69c6-4d56-9f2f-809fda14abf5'; // "is related to"
    private const INSIDE            = '922cca80-a0ba-4a5e-8344-769f083f0e72';
    private const LINK_TO_STORAGE   = '1dcb897e-0f64-499f-b80d-2cac4a025ed4';
    private const LINK_TO_SOURCE    = 'd92fd5cd-ca65-41cb-879e-e87c0450fecd';
    private const DUPLICATE_OF      = '0dc6915e-b92c-4834-b9a3-091273d0d334';
    private const ALSO_KNOWN_AS     = '0a1a2fe7-d4f7-4a85-8514-680cfd518bdb';
    private const BIOLOGICAL_PARENT = 'eca6d324-8ccd-45a1-b8ad-4a2f4bc72d08';
    private const MEMBER_OF         = '6c4c2f74-aa7f-4c17-bdbc-87a55fe253cf';
    private const MEANWHILE         = 'b42957b9-3a93-4092-ad99-811a8478a0d3';

    private const OWNER       = '0ac1b13b-acbf-4246-bed4-8f0c2a8b2546';
    private const SERVER_UUID = 'ef59acea-ab50-47c0-bee1-2b01d7381f76';

    public function up(): void
    {
        // 1. Abstract marker — used to exclude grouping containers from selectors.
        Schema::table('things', function (Blueprint $table) {
            $table->boolean('abstract')->default(false)->after('public');
        });

        // Migrations run before the seeder, so make sure the referenced general
        // types exist (things.type has a FK to general_types).
        foreach ([1 => 'GENERAL', 2 => 'CLASS', 3 => 'THING', 4 => 'LINK'] as $id => $name) {
            DB::table('general_types')->upsert(['id' => $id, 'name' => $name], 'id', ['name']);
        }

        // 2. `meanwhile` is used as a link type but was stored as a CLASS.
        DB::table('things')
            ->where('thing_id', self::MEANWHILE)
            ->update(['type' => \Fokin\Facts\Data\UUID::G_LINK]);

        // 3. test-user-Admin (b6e30d29) is a user account (see users.thing_id),
        //    not a link type — it leaked into the link-type tree.
        DB::table('things')
            ->where('thing_id', 'b6e30d29-aec0-437d-8995-730819e6b47c')
            ->update(['type' => \Fokin\Facts\Data\UUID::G_THING]);

        // 4. Create the base link types.
        $this->createLinkType(self::KIND, 'Kind', true,
            ['lang' => 'en', 'ru' => 'Вид'],
            ['lang' => 'en', 'ru' => 'Отношения классификации (род-вид, экземпляр-класс)']);
        $this->createLinkType(self::CONTAINMENT, 'Containment', true,
            ['lang' => 'en', 'ru' => 'Включение'],
            ['lang' => 'en', 'ru' => 'Отношения часть-целое и пространственное включение']);
        $this->createLinkType(self::EQUIVALENCE, 'Equivalence', true,
            ['lang' => 'en', 'ru' => 'Эквивалентность'],
            ['lang' => 'en', 'ru' => 'Тождество, синонимия и дубликаты']);
        $this->createLinkType(self::TIME, 'Time', true,
            ['lang' => 'en', 'ru' => 'Время'],
            ['lang' => 'en', 'ru' => 'Временной порядок и одновременность']);
        $this->createLinkType(self::FOLLOWED_BY, 'followed by', false,
            ['lang' => 'en', 'ru' => 'следует за'],
            ['lang' => 'en', 'ru' => 'Происходит позже по времени']);

        // 5. Re-parent: remove obsolete "is a parent of" links first (soft delete),
        //    then hang everything off the new bases.
        $this->removeParentOf(self::LINK, self::LINK_TO_PARENT);
        $this->removeParentOf(self::LINK, self::LINK_TO_CLASS);
        $this->removeParentOf(self::LINK, self::ALSO_KNOWN_AS);
        $this->removeParentOf(self::LINK, self::DUPLICATE_OF);
        $this->removeParentOf(self::LINK, self::LINK_TO_STORAGE);
        $this->removeParentOf(self::LINK, self::LINK_TO_SOURCE);
        $this->removeParentOf(self::LINK_TO_PARENT, self::BIOLOGICAL_PARENT);
        $this->removeParentOf(self::LINK_TO_PARENT, self::INSIDE);
        $this->removeParentOf(self::RELATED_TO, self::MEMBER_OF);
        $this->removeParentOf(self::RELATED_TO, self::PRESENT);
        // `meanwhile` was stored as a CLASS, so its old grouping link under
        // "is related to" was invisible to link-type handling and survived.
        $this->removeParentOf(self::RELATED_TO, self::MEANWHILE);

        // Bases under the Link root (keeps "is related to" as a concrete base).
        $this->addParentOf(self::LINK, self::KIND);
        $this->addParentOf(self::LINK, self::CONTAINMENT);
        $this->addParentOf(self::LINK, self::EQUIVALENCE);
        $this->addParentOf(self::LINK, self::TIME);
        $this->addParentOf(self::LINK, self::PRESENT);

        $this->addParentOf(self::KIND, self::LINK_TO_PARENT);
        $this->addParentOf(self::KIND, self::LINK_TO_CLASS);
        $this->addParentOf(self::KIND, self::BIOLOGICAL_PARENT);

        $this->addParentOf(self::CONTAINMENT, self::INSIDE);
        $this->addParentOf(self::CONTAINMENT, self::LINK_TO_STORAGE);
        $this->addParentOf(self::CONTAINMENT, self::LINK_TO_SOURCE);

        $this->addParentOf(self::EQUIVALENCE, self::ALSO_KNOWN_AS);
        $this->addParentOf(self::EQUIVALENCE, self::DUPLICATE_OF);

        $this->addParentOf(self::TIME, self::MEANWHILE);
        $this->addParentOf(self::TIME, self::FOLLOWED_BY);

        $this->addParentOf(self::PRESENT, self::MEMBER_OF);
    }

    public function down(): void
    {
        // Remove the new hierarchy links.
        $this->removeParentOf(self::PRESENT, self::MEMBER_OF);
        $this->removeParentOf(self::TIME, self::FOLLOWED_BY);
        $this->removeParentOf(self::TIME, self::MEANWHILE);
        $this->removeParentOf(self::EQUIVALENCE, self::DUPLICATE_OF);
        $this->removeParentOf(self::EQUIVALENCE, self::ALSO_KNOWN_AS);
        $this->removeParentOf(self::CONTAINMENT, self::LINK_TO_SOURCE);
        $this->removeParentOf(self::CONTAINMENT, self::LINK_TO_STORAGE);
        $this->removeParentOf(self::CONTAINMENT, self::INSIDE);
        $this->removeParentOf(self::KIND, self::BIOLOGICAL_PARENT);
        $this->removeParentOf(self::KIND, self::LINK_TO_CLASS);
        $this->removeParentOf(self::KIND, self::LINK_TO_PARENT);
        $this->removeParentOf(self::LINK, self::PRESENT);
        $this->removeParentOf(self::LINK, self::TIME);
        $this->removeParentOf(self::LINK, self::EQUIVALENCE);
        $this->removeParentOf(self::LINK, self::CONTAINMENT);
        $this->removeParentOf(self::LINK, self::KIND);

        // Restore the original hierarchy.
        $this->restoreParentOf(self::RELATED_TO, self::PRESENT);
        $this->restoreParentOf(self::RELATED_TO, self::MEMBER_OF);
        $this->restoreParentOf(self::RELATED_TO, self::MEANWHILE);
        $this->restoreParentOf(self::LINK_TO_PARENT, self::INSIDE);
        $this->restoreParentOf(self::LINK_TO_PARENT, self::BIOLOGICAL_PARENT);
        $this->restoreParentOf(self::LINK, self::LINK_TO_SOURCE);
        $this->restoreParentOf(self::LINK, self::LINK_TO_STORAGE);
        $this->restoreParentOf(self::LINK, self::DUPLICATE_OF);
        $this->restoreParentOf(self::LINK, self::ALSO_KNOWN_AS);
        $this->restoreParentOf(self::LINK, self::LINK_TO_CLASS);
        $this->restoreParentOf(self::LINK, self::LINK_TO_PARENT);

        // Drop the new base link types.
        DB::table('things')
            ->whereIn('thing_id', [
                self::FOLLOWED_BY,
                self::TIME,
                self::EQUIVALENCE,
                self::CONTAINMENT,
                self::KIND,
            ])
            ->delete();

        // Restore `meanwhile` back to a CLASS.
        DB::table('things')
            ->where('thing_id', self::MEANWHILE)
            ->update(['type' => \Fokin\Facts\Data\UUID::G_CLASS]);

        // Restore test-user-Admin back to a LINK type.
        DB::table('things')
            ->where('thing_id', 'b6e30d29-aec0-437d-8995-730819e6b47c')
            ->update(['type' => \Fokin\Facts\Data\UUID::G_LINK]);

        Schema::table('things', function (Blueprint $table) {
            $table->dropColumn('abstract');
        });
    }

    private function createLinkType(
        string $uuid,
        string $name,
        bool $abstract,
        array $nameTranslations,
        array $descriptionTranslations
    ): void {
        DB::table('things')->insert([
            'thing_id'                 => $uuid,
            'name'                     => $name,
            'type'                     => \Fokin\Facts\Data\UUID::G_LINK,
            'description'              => $descriptionTranslations['ru'] ?? $name,
            'public'                   => true,
            'abstract'                 => $abstract,
            'owner'                    => self::OWNER,
            'server_uuid'              => self::SERVER_UUID,
            'name_translations'        => json_encode($nameTranslations),
            'description_translations' => json_encode($descriptionTranslations),
        ]);
    }

    private function addParentOf(string $parent, string $child): void
    {
        // On a fresh install the reserved things (Link, is a parent of, …) do not
        // exist yet — the seeder creates them and applies the hierarchy from the
        // regenerated system-objects export. Skip so the migration never hits an
        // FK violation; on the dev DB (where the endpoints exist) it re-parents.
        if (!$this->thingExists(self::LINK_TO_PARENT)
            || !$this->thingExists($parent)
            || !$this->thingExists($child)) {
            return;
        }
        $parentName = $this->linkName($parent);
        $childName  = $this->linkName($child);
        DB::table('links')->insert([
            'link_uuid'     => (string) \Illuminate\Support\Str::uuid(),
            'one_thing_id'  => $parent,
            'link_type_id'  => self::LINK_TO_PARENT,
            'other_thing_id'=> $child,
            'public'        => true,
            'translation'   => "\"{$childName}\" is subclass of \"{$parentName}\"",
        ]);
    }

    private function removeParentOf(string $parent, string $child): void
    {
        DB::table('links')
            ->where('one_thing_id', $parent)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', $child)
            ->update(['deleted' => true]);
    }

    private function restoreParentOf(string $parent, string $child): void
    {
        DB::table('links')
            ->where('one_thing_id', $parent)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', $child)
            ->update(['deleted' => false]);
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
