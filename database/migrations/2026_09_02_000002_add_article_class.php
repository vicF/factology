<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Add the "Article" class (Статья).
 *
 * When an external link cannot be auto-classified as video/image/audio, the
 * edit modal lets the user promote it manually — one of the choices is
 * "article" (a web page / online article that the object cites or points to).
 */
return new class extends Migration
{
    private const ARTICLE_CLASS = 'e1d4c1d1-0002-4c1a-8000-000000000002';

    private const DOCUMENT     = '9f7436db-6253-4718-aa61-b4676faa90c7';
    private const LINK_TO_PARENT = '361c19af-c011-4051-9329-49c75d1ca0fb';

    private const SYSTEM_OWNER = 'aaaaaaaa-0000-4000-a000-00000000000a';
    private const SERVER_UUID  = 'ef59acea-ab50-47c0-bee1-2b01d7381f76';

    public function up(): void
    {
        DB::table('things')->insertOrIgnore([
            'thing_id'                 => self::ARTICLE_CLASS,
            'name'                     => 'Article',
            'type'                     => \Fokin\Facts\Data\UUID::G_CLASS,
            'description'              => 'Web article or page cited or referenced by an object',
            'public'                   => true,
            'abstract'                 => false,
            'owner'                    => self::SYSTEM_OWNER,
            'server_uuid'              => self::SERVER_UUID,
            'name_translations'        => json_encode(['lang' => 'en', 'ru' => 'Статья']),
            'description_translations' => json_encode(['lang' => 'en', 'ru' => 'Веб-статья или страница, на которую ссылается объект']),
            'data'                     => json_encode(['properties' => []]),
        ]);

        if ($this->thingExists(self::DOCUMENT) && $this->thingExists(self::ARTICLE_CLASS)) {
            DB::table('links')->insertOrIgnore([
                'link_uuid'      => (string) \Illuminate\Support\Str::uuid(),
                'one_thing_id'   => self::DOCUMENT,
                'link_type_id'   => self::LINK_TO_PARENT,
                'other_thing_id' => self::ARTICLE_CLASS,
                'public'         => true,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('links')
            ->where('one_thing_id', self::DOCUMENT)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', self::ARTICLE_CLASS)
            ->update(['deleted' => true]);
        DB::table('things')->where('thing_id', self::ARTICLE_CLASS)->delete();
    }

    private function thingExists(string $uuid): bool
    {
        return DB::table('things')->where('thing_id', $uuid)->exists();
    }
};
