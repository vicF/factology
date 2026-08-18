<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Refine the link-type taxonomy (follow-up to 2026_08_14 link_taxonomy_bases).
 *
 * 1. Rename the "Kind" base to "Hierarchy" — it groups structural relations
 *    (superclass-subclass, instance-class), not "kinds" ("Вид" is a species
 *    unit in taxonomy, not a category of relations).
 * 2. Rename the structural tree link "is a parent of" (LINK_TO_PARENT) to
 *    "is a superclass of" — reserving the word "parent" for family relations
 *    only, so the link picker cannot confuse the object/class hierarchy with
 *    kinship.
 * 3. Introduce a new abstract base "Kinship" (Родственные отношения) and move
 *    the "is a biological parent" subtree under it; add stepfather/stepmother/
 *    relative as concrete kinship relations.
 */
return new class extends Migration
{
    // ── Existing structural UUIDs (mirror of Fokin\Facts\Data\UUID) ──
    private const KIND              = '733112a1-9e87-47ee-8a86-81cc38e77a41';
    private const LINK              = '4b27fd0c-d8be-425c-a529-2186b2589e76';
    private const LINK_TO_PARENT    = '361c19af-c011-4051-9329-49c75d1ca0fb';
    private const BIOLOGICAL_PARENT = 'eca6d324-8ccd-45a1-b8ad-4a2f4bc72d08';

    // ── New link types (generated UUIDs) ──
    private const KINSHIP    = 'b04d6a70-fb73-4ccf-badc-a7b1a9ff3dde';
    private const STEPFATHER = 'ef841bd8-b142-4d4c-97ae-dbf8399d4b59';
    private const STEPMOTHER = '2f6ddb60-0cce-497b-bdbc-5e2234dad969';
    private const RELATIVE   = 'a2c12996-a579-4583-93c4-6adad5e61934';

    private const SYSTEM_OWNER = 'aaaaaaaa-0000-4000-a000-00000000000a';
    private const SERVER_UUID  = 'ef59acea-ab50-47c0-bee1-2b01d7381f76';

    public function up(): void
    {
        // 1. Rename the "Kind" base → Hierarchy.
        DB::table('things')->where('thing_id', self::KIND)->update([
            'name'                     => 'Hierarchy',
            'name_translations'        => json_encode(['lang' => 'en', 'ru' => 'Иерархия']),
            'description'              => 'Отношения иерархии и классификации (надкласс-подкласс, экземпляр-класс)',
            'description_translations' => json_encode(['lang' => 'en', 'ru' => 'Отношения иерархии и классификации (надкласс-подкласс, экземпляр-класс)']),
        ]);

        // 2. Rename the structural tree link — reserve "parent" for kinship.
        DB::table('things')->where('thing_id', self::LINK_TO_PARENT)->update([
            'name'                     => 'is a superclass of',
            'name_translations'        => json_encode(['lang' => 'en', 'ru' => 'является надклассом']),
            'description'              => 'The object is a more general class/category that the linked object subclasses',
            'description_translations' => json_encode(['lang' => 'en', 'ru' => 'Объект является более общим классом/категорией (надклассом), чем связанный объект']),
        ]);

        // 3. Create the Kinship base under the Link root.
        $this->createLinkType(self::KINSHIP, 'Kinship', true,
            ['lang' => 'en', 'ru' => 'Родственные отношения'],
            ['lang' => 'en', 'ru' => 'Семейные и родственные связи (родители, дети, супруги, родственники)']);
        $this->addParentOf(self::LINK, self::KINSHIP);

        // 4. Move the biological-parent subtree under Kinship.
        $this->removeParentOf(self::KIND, self::BIOLOGICAL_PARENT);
        $this->addParentOf(self::KINSHIP, self::BIOLOGICAL_PARENT);

        // 5. New concrete kinship relations.
        $this->createLinkType(self::STEPFATHER, 'is a stepfather of', false,
            ['lang' => 'en', 'ru' => 'является отчимом'],
            ['lang' => 'en', 'ru' => 'Мужчина, вступивший в брак с матерью, но не являющийся биологическим отцом']);
        $this->createLinkType(self::STEPMOTHER, 'is a stepmother of', false,
            ['lang' => 'en', 'ru' => 'является мачехой'],
            ['lang' => 'en', 'ru' => 'Женщина, вступившая в брак с отцом, но не являющаяся биологической матерью']);
        $this->createLinkType(self::RELATIVE, 'is a relative of', false,
            ['lang' => 'en', 'ru' => 'является родственником'],
            ['lang' => 'en', 'ru' => 'Состоит в родственной связи']);
        $this->addParentOf(self::KINSHIP, self::STEPFATHER);
        $this->addParentOf(self::KINSHIP, self::STEPMOTHER);
        $this->addParentOf(self::KINSHIP, self::RELATIVE);
    }

    public function down(): void
    {
        // Remove the new kinship children.
        $this->removeParentOf(self::KINSHIP, self::RELATIVE);
        $this->removeParentOf(self::KINSHIP, self::STEPMOTHER);
        $this->removeParentOf(self::KINSHIP, self::STEPFATHER);
        DB::table('things')->whereIn('thing_id', [self::RELATIVE, self::STEPMOTHER, self::STEPFATHER])->delete();

        // Move the biological-parent subtree back under Kind.
        $this->removeParentOf(self::KINSHIP, self::BIOLOGICAL_PARENT);
        $this->addParentOf(self::KIND, self::BIOLOGICAL_PARENT);

        // Remove the Kinship base.
        $this->removeParentOf(self::LINK, self::KINSHIP);
        DB::table('things')->where('thing_id', self::KINSHIP)->delete();

        // Restore names.
        DB::table('things')->where('thing_id', self::LINK_TO_PARENT)->update([
            'name'                     => 'is a parent of',
            'name_translations'        => json_encode(['lang' => 'en', 'ru' => 'является родителем']),
            'description'              => 'Type of parent link whatever it can mean',
            'description_translations' => json_encode(['lang' => 'en']),
        ]);
        DB::table('things')->where('thing_id', self::KIND)->update([
            'name'                     => 'Kind',
            'name_translations'        => json_encode(['lang' => 'en', 'ru' => 'Вид']),
            'description'              => 'Отношения классификации (род-вид, экземпляр-класс)',
            'description_translations' => json_encode(['lang' => 'en', 'ru' => 'Отношения классификации (род-вид, экземпляр-класс)']),
        ]);
    }

    private function createLinkType(
        string $uuid,
        string $name,
        bool $abstract,
        array $nameTranslations,
        array $descriptionTranslations
    ): void {
        DB::table('things')->insertOrIgnore([
            'thing_id'                 => $uuid,
            'name'                     => $name,
            'type'                     => \Fokin\Facts\Data\UUID::G_LINK,
            'description'              => $descriptionTranslations['ru'] ?? $name,
            'public'                   => true,
            'abstract'                 => $abstract,
            'owner'                    => self::SYSTEM_OWNER,
            'server_uuid'              => self::SERVER_UUID,
            'name_translations'        => json_encode($nameTranslations),
            'description_translations' => json_encode($descriptionTranslations),
            'data'                     => json_encode(['properties' => []]),
        ]);
    }

    private function addParentOf(string $parent, string $child): void
    {
        // On a fresh install the reserved things (Link, is a superclass of, …)
        // do not exist yet — the seeder creates them and applies the hierarchy
        // from the regenerated system-objects export. Skip so the migration
        // never hits an FK violation; on the dev DB it re-parents.
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

    private function removeParentOf(string $parent, string $child): void
    {
        DB::table('links')
            ->where('one_thing_id', $parent)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', $child)
            ->update(['deleted' => true]);
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
