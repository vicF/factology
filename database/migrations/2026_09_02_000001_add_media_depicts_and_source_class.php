<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * External-links rework taxonomy objects:
 *
 * 1. "has media depicting" — a concrete link type that connects an object
 *    (e.g. a regatta event) to a media object (e.g. "TV footage of regatta")
 *    created from a pasted external link. Hung under the abstract Containment
 *    base alongside LINK_TO_SOURCE / LINK_TO_STORAGE.
 *
 * 2. "Source" class (Источник) — the GEDCOM importer materialises bibliographic
 *    sources as real objects; they used to be class-linked to UUID::EVIDENCE,
 *    which is a *link type*, not a class (a bogus "instance-of link type"
 *    relation). Real sources now class under this class instead.
 */
return new class extends Migration
{
    private const MEDIA_DEPICTS = 'b4d2a9c2-0001-4c1a-8000-000000000001';
    private const SOURCE_CLASS  = 'e1d4c1d1-0002-4c1a-8000-000000000001';

    private const CONTAINMENT  = '79762fd7-e52d-4401-8010-fda9a7e81aa0';
    private const DOCUMENT     = '9f7436db-6253-4718-aa61-b4676faa90c7';
    private const LINK_TO_PARENT = '361c19af-c011-4051-9329-49c75d1ca0fb';

    private const SYSTEM_OWNER = 'aaaaaaaa-0000-4000-a000-00000000000a';
    private const SERVER_UUID  = 'ef59acea-ab50-47c0-bee1-2b01d7381f76';

    public function up(): void
    {
        DB::table('things')->insertOrIgnore([
            'thing_id'                 => self::MEDIA_DEPICTS,
            'name'                     => 'has media depicting',
            'type'                     => \Fokin\Facts\Data\UUID::G_LINK,
            'description'              => 'Object has a photo/video/audio record depicting it',
            'public'                   => true,
            'abstract'                 => false,
            'owner'                    => self::SYSTEM_OWNER,
            'server_uuid'              => self::SERVER_UUID,
            'name_translations'        => json_encode(['lang' => 'en', 'ru' => 'имеет медиа-запись']),
            'description_translations' => json_encode(['lang' => 'en', 'ru' => 'Объект имеет фото/видео/аудио-запись, изображающую его']),
            'data'                     => json_encode(['properties' => []]),
        ]);
        $this->addParentOf(self::CONTAINMENT, self::MEDIA_DEPICTS);

        DB::table('things')->insertOrIgnore([
            'thing_id'                 => self::SOURCE_CLASS,
            'name'                     => 'Source',
            'type'                     => \Fokin\Facts\Data\UUID::G_CLASS,
            'description'              => 'Bibliographic or online source cited by events/persons',
            'public'                   => true,
            'abstract'                 => false,
            'owner'                    => self::SYSTEM_OWNER,
            'server_uuid'              => self::SERVER_UUID,
            'name_translations'        => json_encode(['lang' => 'en', 'ru' => 'Источник']),
            'description_translations' => json_encode(['lang' => 'en', 'ru' => 'Библиографический или онлайн-источник, на который ссылаются события/персоны']),
            'data'                     => json_encode(['properties' => []]),
        ]);
        $this->addParentOf(self::DOCUMENT, self::SOURCE_CLASS);
    }

    public function down(): void
    {
        DB::table('links')
            ->where('one_thing_id', self::CONTAINMENT)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', self::MEDIA_DEPICTS)
            ->update(['deleted' => true]);
        DB::table('things')->where('thing_id', self::MEDIA_DEPICTS)->delete();

        DB::table('links')
            ->where('one_thing_id', self::DOCUMENT)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', self::SOURCE_CLASS)
            ->update(['deleted' => true]);
        DB::table('things')->where('thing_id', self::SOURCE_CLASS)->delete();
    }

    private function addParentOf(string $parent, string $child): void
    {
        if (!$this->thingExists(self::LINK_TO_PARENT)
            || !$this->thingExists($parent)
            || !$this->thingExists($child)) {
            return;
        }
        DB::table('links')->insertOrIgnore([
            'link_uuid'      => (string) \Illuminate\Support\Str::uuid(),
            'one_thing_id'   => $parent,
            'link_type_id'   => self::LINK_TO_PARENT,
            'other_thing_id' => $child,
            'public'         => true,
        ]);
    }

    private function thingExists(string $uuid): bool
    {
        return DB::table('things')->where('thing_id', $uuid)->exists();
    }
};
