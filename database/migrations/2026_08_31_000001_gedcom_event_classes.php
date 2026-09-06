<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const EVENT = '0eed3b56-bdd6-47f0-9413-d9640a9dcafc';
    private const PLACE_CLASS = 'dc006cda-047a-4862-acf7-e215355b6890';
    private const LINK_TO_PARENT = '361c19af-c011-4051-9329-49c75d1ca0fb';
    private const OWNER = '0ac1b13b-acbf-4246-bed4-8f0c2a8b2546';
    private const SERVER_UUID = 'ef59acea-ab50-47c0-bee1-2b01d7381f76';
    private const G_CLASS = 2;

    private const BIRTH_CLASS = 'a565fc22-6dae-4b7a-bd9e-30df8bc8acca';
    private const DEATH_CLASS = '6ea018a1-d71c-4655-89b9-9f469b979847';
    private const RESIDENCE_CLASS = 'a70ae070-0c52-4a89-84a0-5c76f76e5aa7';
    private const OCCUPATION_CLASS = '7fae11dc-3411-4652-9712-18729bf1e3a7';
    private const MARRIAGE_CLASS = 'f5fe8e87-da33-4a40-ad7f-1b62b4e62299';
    private const BURIAL_CLASS = '02a3040c-c9fd-48b7-9f1c-57ef66002aa6';
    private const EDUCATION_CLASS = '5092247b-8fff-475f-b90c-22b29bf59532';
    private const CHRISTENING_CLASS = '2e3e8252-47c6-44e0-8804-6083ec506a92';
    private const ADDRESS_CLASS = '42a2e356-8ad1-406a-b78e-db13febf0415';

    private const EVENT_CLASSES = [
        self::BIRTH_CLASS       => ['en' => 'Birth',       'ru' => 'Рождение'],
        self::DEATH_CLASS       => ['en' => 'Death',       'ru' => 'Смерть'],
        self::RESIDENCE_CLASS   => ['en' => 'Residence In','ru' => 'Проживание в'],
        self::OCCUPATION_CLASS  => ['en' => 'Occupation',  'ru' => 'Работа'],
        self::MARRIAGE_CLASS    => ['en' => 'Marriage',    'ru' => 'Брак'],
        self::BURIAL_CLASS      => ['en' => 'Burial',      'ru' => 'Похороны'],
        self::EDUCATION_CLASS   => ['en' => 'Education',   'ru' => 'Образование'],
        self::CHRISTENING_CLASS => ['en' => 'Christening', 'ru' => 'Крещение'],
    ];

    public function up(): void
    {
        foreach (self::EVENT_CLASSES as $uuid => $names) {
            if (!$this->thingExists($uuid)) {
                DB::table('things')->insert([
                    'thing_id'          => $uuid,
                    'name'              => $names['en'],
                    'name_translations' => json_encode(['lang' => 'en', 'en' => $names['en'], 'ru' => $names['ru']]),
                    'type'        => self::G_CLASS,
                    'public'      => true,
                    'owner'       => self::OWNER,
                    'server_uuid' => self::SERVER_UUID,
                ]);
            }
            if ($this->thingExists(self::EVENT) && $this->thingExists($uuid)) {
                $this->ensureParentLink(self::EVENT, $uuid);
            }
        }

        if (!$this->thingExists(self::ADDRESS_CLASS)) {
            DB::table('things')->insert([
                'thing_id'          => self::ADDRESS_CLASS,
                'name'              => 'Address',
                'name_translations' => json_encode(['lang' => 'en', 'en' => 'Address', 'ru' => 'Адрес']),
                'type'        => self::G_CLASS,
                'public'      => true,
                'owner'       => self::OWNER,
                'server_uuid' => self::SERVER_UUID,
            ]);
        }
        if ($this->thingExists(self::PLACE_CLASS) && $this->thingExists(self::ADDRESS_CLASS)) {
            $this->ensureParentLink(self::PLACE_CLASS, self::ADDRESS_CLASS);
        }
    }

    public function down(): void
    {
        foreach (self::EVENT_CLASSES as $uuid => $names) {
            DB::table('links')
                ->where('one_thing_id', self::EVENT)
                ->where('link_type_id', self::LINK_TO_PARENT)
                ->where('other_thing_id', $uuid)->delete();
            DB::table('things')->where('thing_id', $uuid)->delete();
        }
        DB::table('links')
            ->where('one_thing_id', self::PLACE_CLASS)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', self::ADDRESS_CLASS)->delete();
        DB::table('things')->where('thing_id', self::ADDRESS_CLASS)->delete();
    }

    private function thingExists(string $uuid): bool
    {
        return DB::table('things')->where('thing_id', $uuid)->exists();
    }

    private function ensureParentLink(string $parentId, string $childId): void
    {
        $existing = DB::table('links')
            ->where('one_thing_id', $parentId)
            ->where('link_type_id', self::LINK_TO_PARENT)
            ->where('other_thing_id', $childId)->first();
        if (!$existing) {
            DB::table('links')->insert([
                'link_uuid'      => (string) Illuminate\Support\Str::uuid(),
                'one_thing_id'   => $parentId,
                'link_type_id'   => self::LINK_TO_PARENT,
                'other_thing_id' => $childId,
                'public'         => true,
            ]);
        }
    }
};