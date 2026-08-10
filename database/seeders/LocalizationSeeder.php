<?php

namespace Database\Seeders;

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Seeded system objects for the localization feature:
 *  - "Property" class thing  (users create property-definition objects of this class)
 *  - "Language" class thing  (users create language objects of this class)
 *  - PROPERTY_APPLIES_TO link type (property thing -> class thing, drives suggestions)
 *  - en / ru language objects
 */
class LocalizationSeeder extends Seeder
{
    public function run(): void
    {
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        $things = [
            [
                'thing_id'           => UUID::PROPERTY_CLASS,
                'name'               => 'Property',
                'description'        => 'A system class for property definitions (weight, sex, telephone, ...).',
                'type'               => UUID::G_CLASS,
                'public'             => true,
                'name_translations'  => json_encode(['lang' => 'en', 'ru' => 'Свойство']),
            ],
            [
                'thing_id'           => UUID::LANGUAGE_CLASS,
                'name'               => 'Language',
                'description'        => 'A system class for language definitions.',
                'type'               => UUID::G_CLASS,
                'public'             => true,
                'name_translations'  => json_encode(['lang' => 'en', 'ru' => 'Язык']),
            ],
            [
                'thing_id'           => UUID::PROPERTY_APPLIES_TO,
                'name'               => 'is a property of class',
                'description'        => 'Links a property definition to a class it applies to (for suggestions).',
                'type'               => UUID::G_LINK,
                'public'             => true,
                'name_translations'  => json_encode(['lang' => 'en', 'ru' => 'является свойством класса']),
            ],
        ];
        foreach ($things as $thing) {
            DB::table('things')->upsert(
                array_merge($thing, ['server_uuid' => $serverUuid]),
                ['thing_id'],
                ['name', 'description', 'public', 'server_uuid', 'name_translations']
            );
        }

        // Class hierarchy: Property and Language are subclasses of Everything
        $this->upsertLink(UUID::EVERYTHING, UUID::LINK_TO_PARENT, UUID::PROPERTY_CLASS, '"Property" is subclass of "Everything"');
        $this->upsertLink(UUID::EVERYTHING, UUID::LINK_TO_PARENT, UUID::LANGUAGE_CLASS, '"Language" is subclass of "Everything"');

        // Language objects
        $languages = [
            [
                'thing_id'           => UUID::LANG_EN,
                'name'               => 'English',
                'description'        => 'English language',
                'type'               => UUID::G_THING,
                'public'             => true,
                'name_translations'  => json_encode(['lang' => 'en', 'ru' => 'Английский']),
                'data'               => json_encode(['lang_code' => 'en']),
            ],
            [
                'thing_id'           => UUID::LANG_RU,
                'name'               => 'Русский',
                'description'        => 'Russian language',
                'type'               => UUID::G_THING,
                'public'             => true,
                'name_translations'  => json_encode(['lang' => 'ru', 'en' => 'Russian']),
                'data'               => json_encode(['lang_code' => 'ru']),
            ],
        ];
        foreach ($languages as $lang) {
            DB::table('things')->upsert(
                array_merge($lang, ['server_uuid' => $serverUuid]),
                ['thing_id'],
                ['name', 'description', 'public', 'server_uuid', 'name_translations', 'data']
            );
            $this->upsertLink($lang['thing_id'], UUID::LINK_TO_CLASS, UUID::LANGUAGE_CLASS, '"' . $lang['name'] . '" is of class Language');
        }
    }

    /**
     * Idempotent link upsert: matches on (one_thing_id, link_type_id, other_thing_id).
     * link_uuid is required (NOT NULL) and therefore generated for new rows.
     */
    private function upsertLink(string $one, string $type, string $other, string $translation): void
    {
        $link = DB::table('links')
            ->where('one_thing_id', $one)
            ->where('link_type_id', $type)
            ->where('other_thing_id', $other)
            ->first();

        if ($link) {
            DB::table('links')
                ->where('link_id', $link->link_id)
                ->update(['translation' => $translation, 'public' => true]);
        } else {
            DB::table('links')->insert([
                'one_thing_id'   => $one,
                'link_type_id'   => $type,
                'other_thing_id' => $other,
                'translation'    => $translation,
                'public'         => true,
                'link_uuid'      => (string) Str::uuid(),
            ]);
        }
    }
}
