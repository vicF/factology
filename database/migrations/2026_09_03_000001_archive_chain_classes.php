<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Add universal archive-chain classes (ISAD-G): Archive → Fonds → Series → File.
 *
 * Russian archival references ("ГАВО Ф.179 оп.1 д.18") decompose into
 * repository → fonds → series → file. These classes model that chain as
 * nested containment (INSIDE) so a citation can point at the most specific
 * archival unit (the "дело"/file).
 */
return new class extends Migration
{
    private const DOCUMENT = '9f7436db-6253-4718-aa61-b4676faa90c7';
    private const LINK_TO_PARENT = '361c19af-c011-4051-9329-49c75d1ca0fb';
    private const OWNER = 'aaaaaaaa-0000-4000-a000-00000000000a';
    private const SERVER_UUID = 'ef59acea-ab50-47c0-bee1-2b01d7381f76';
    private const G_CLASS = 2;

    private const ARCHIVE_CLASS = 'c2c2c2c2-0001-4000-8000-000000000001';
    private const FONDS_CLASS = 'c2c2c2c2-0002-4000-8000-000000000001';
    private const SERIES_CLASS = 'c2c2c2c2-0003-4000-8000-000000000001';
    private const FILE_CLASS = 'c2c2c2c2-0004-4000-8000-000000000001';

    private const CHAIN = [
        self::ARCHIVE_CLASS => ['en' => 'Archive', 'ru' => 'Архив',      'parent' => self::DOCUMENT,  'desc' => 'Архив / репозиторий, хранящий документы'],
        self::FONDS_CLASS   => ['en' => 'Fonds',   'ru' => 'Фонд',       'parent' => self::ARCHIVE_CLASS, 'desc' => 'Фонд (ISAD-G fonds) — совокупность документов одного создателя'],
        self::SERIES_CLASS  => ['en' => 'Series',  'ru' => 'Опись',      'parent' => self::FONDS_CLASS, 'desc' => 'Опись (ISAD-G series) — систематизированная группа дел'],
        self::FILE_CLASS    => ['en' => 'File',    'ru' => 'Дело',       'parent' => self::SERIES_CLASS, 'desc' => 'Дело / единица хранения (ISAD-G file)'],
    ];

    public function up(): void
    {
        foreach (self::CHAIN as $uuid => $meta) {
            if (!$this->thingExists($uuid)) {
                DB::table('things')->insert([
                    'thing_id'          => $uuid,
                    'name'              => $meta['en'],
                    'name_translations' => json_encode(['lang' => 'en', 'en' => $meta['en'], 'ru' => $meta['ru']]),
                    'description'       => $meta['desc'],
                    'type'              => self::G_CLASS,
                    'public'            => true,
                    'owner'             => self::OWNER,
                    'server_uuid'       => self::SERVER_UUID,
                ]);
            }
            if ($this->thingExists($meta['parent']) && $this->thingExists($uuid)) {
                $this->ensureParentLink($meta['parent'], $uuid);
            }
        }
    }

    public function down(): void
    {
        foreach (self::CHAIN as $uuid => $meta) {
            DB::table('links')
                ->where('one_thing_id', $meta['parent'])
                ->where('link_type_id', self::LINK_TO_PARENT)
                ->where('other_thing_id', $uuid)->delete();
            DB::table('things')->where('thing_id', $uuid)->delete();
        }
    }

    private function thingExists(string $uuid): bool
    {
        return DB::table('things')->where('thing_id', $uuid)->exists();
    }

    private function ensureParentLink(string $parentId, string $childId): void
    {
        // On a fresh install the reserved link-type things do not exist yet —
        // the seeder creates them later. Guard so migrate never hits an FK
        // violation; on the dev DB (already seeded) the hierarchy is applied.
        if (!$this->thingExists(self::LINK_TO_PARENT)) {
            return;
        }
        $existing = DB::table('links')
            ->where('one_thing_id', $parentId)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', $childId)->first();
        if (!$existing) {
            DB::table('links')->insert([
                'link_uuid'     => (string) Illuminate\Support\Str::uuid(),
                'one_thing_id'  => $parentId,
                'link_type_id'  => self::LINK_TO_PARENT,
                'other_thing_id'=> $childId,
                'public'        => true,
            ]);
        }
    }
};
