<?php

namespace Database\Seeders;

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // ============================================================
        // Bootstrap data: system objects required by the application.
        // These are not user data — they are infrastructure records
        // referenced by the code (e.g. UUID::ANYTHING, UUID::USER).
        // ============================================================

        // General types
        if (DB::table('general_types')->count() === 0) {
            DB::table('general_types')->insert([
                ['id' => UUID::GENERAL,   'name' => 'GENERAL'],
                ['id' => UUID::G_CLASS,   'name' => 'CLASS'],
                ['id' => UUID::G_THING,   'name' => 'THING'],
                ['id' => UUID::G_LINK,    'name' => 'LINK'],
                ['id' => UUID::G_EXTERNAL,'name' => 'EXTERNAL'],
                ['id' => UUID::G_SERVER,  'name' => 'SERVER'],
            ]);
        }

        // Bootstrap things (class hierarchy root nodes)
        if (DB::table('things')->count() === 0) {
            DB::table('things')->insert([
                [
                    'thing_id'    => UUID::ANYTHING,
                    'name'        => 'Anything',
                    'description' => 'base object for everything',
                    'type'        => UUID::G_CLASS,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::LINK,
                    'name'        => 'Link',
                    'description' => 'base object for links',
                    'type'        => UUID::G_LINK,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::LINK_TO_PARENT,
                    'name'        => 'is a parent of',
                    'description' => 'Type of parent link whatever it can mean',
                    'type'        => UUID::G_LINK,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::LINK_TO_CLASS,
                    'name'        => 'is of class',
                    'description' => 'Link to a class of an object',
                    'type'        => UUID::G_LINK,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::SOMETHING,
                    'name'        => 'Something',
                    'description' => 'base class for all other classes',
                    'type'        => UUID::G_CLASS,
                    'public'      => true,
                ],
                [
                    'thing_id'    => UUID::USER,
                    'name'        => 'User',
                    'description' => 'base class for user objects',
                    'type'        => UUID::G_CLASS,
                    'public'      => false,
                ],
                [
                    'thing_id'    => UUID::SYSTEM,
                    'name'        => 'System',
                    'description' => 'system class',
                    'type'        => UUID::G_CLASS,
                    'public'      => false,
                ],
                [
                    'thing_id'    => UUID::VICTOR_FOKIN,
                    'name'        => 'System',
                    'description' => 'default owner / system account',
                    'type'        => UUID::GENERAL,
                    'public'      => false,
                ],
            ]);
        }

        // Bootstrap links (class hierarchy edges)
        // Direction: one_thing_id is the PARENT, other_thing_id is the CHILD
        if (DB::table('links')->count() === 0) {
            DB::table('links')->insert([
                [
                    'translation'    => '"Link" is subclass of "Anything"',
                    'one_thing_id'   => UUID::ANYTHING,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => UUID::LINK,
                ],
                [
                    'translation'    => '"Parent" is subclass of "Link"',
                    'one_thing_id'   => UUID::LINK,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => UUID::LINK_TO_PARENT,
                ],
                [
                    'translation'    => '"Class of" is subclass of "Link"',
                    'one_thing_id'   => UUID::LINK,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => UUID::LINK_TO_CLASS,
                ],
                [
                    'translation'    => '"Something" is subclass of "Anything"',
                    'one_thing_id'   => UUID::ANYTHING,
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => UUID::SOMETHING,
                ],
            ]);
        }

        // ============================================================
        // Class hierarchy (public G_CLASS things)
        // Seeded from the existing database — real UUIDs preserved.
        // ============================================================
        $classes = [
            ['thing_id' => 'c532f6ba-27b2-43ec-b4ec-30cbff78eed0', 'name' => 'Access group',             'description' => 'Группа для доступа к ресурсам. Члены этой группы имеют доступ к ресурсам, с которыми эта группа связана. Экспериментально!', 'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '03d72750-32b4-4c52-8a59-37fbb93b3082', 'name' => 'Audio',                    'description' => 'аудио',                                                                                                                              'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'fb8d457c-62b4-43e9-9e4d-014201176f01', 'name' => 'Book',                     'description' => 'Книга',                                                                                                                              'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '5787ef00-3f6b-46fe-9e93-d32c9ebdeab4', 'name' => 'Building, house',          'description' => 'Дом, строение',                                                                                                                      'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'db91a470-2590-4f33-92bd-3e3dd33f5353', 'name' => 'Bicycle',                  'description' => 'Велосипед',                                                                                                                          'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '4e605e49-3bbc-4bae-83fd-f1e7d7c76a77', 'name' => 'Car',                      'description' => 'автомобиль',                                                                                                                         'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'f48ef10a-40f6-4190-bfae-2834e9781ad1', 'name' => 'Character',                'description' => 'Некий персонаж, действующее лицо, вымышленный или настоящий.',                                                                       'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '960e0074-5945-4163-a9ba-576a09ced6da', 'name' => 'Check In',                 'description' => 'Посещение какого то места',                                                                                                          'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '14cd9c8b-84a4-4fd2-82a8-97477ff2d5ee', 'name' => 'City',                     'description' => 'Город',                                                                                                                              'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '6a65dbf3-ad39-4446-8b8b-c0f539c1d53a', 'name' => 'Collection',               'description' => 'Коллекция, список',                                                                                                                  'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '2067c7bf-0f6f-491d-af2b-10105db4e8cc', 'name' => 'Company, Brand',           'description' => 'Компания, бренд',                                                                                                                    'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '4e3b5c5f-f347-42d9-9e93-3093b420d2f5', 'name' => 'Computer Data',            'description' => 'Некие компьютерные данные. Файл, папка.',                                                                                             'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'ad3f8571-9b56-40af-b9c0-8d375f3b1976', 'name' => 'Computer Media',           'description' => 'Фото, видео, аудио и т.п.',                                                                                                          'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'ea7aed7a-8cdf-45e4-9896-43c57ffdf132', 'name' => 'Computing Device',         'description' => 'Компьютер, смартфон или что то ещё такое вычислительное',                                                                              'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'ad4be260-0af0-4e7c-928e-a7177158e1d0', 'name' => 'Continent',                'description' => 'Континетн',                                                                                                                          'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '20f6b1ae-86de-4221-bf0c-995be2687405', 'name' => 'Country',                  'description' => 'Страна',                                                                                                                             'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '73482bbe-d377-4e01-9efb-de135916c94a', 'name' => 'Country place',             'description' => 'Некая область на карте, имеющая название',                                                                                            'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '36255438-6a10-4036-8df3-7894801b2759', 'name' => 'Disaster',                  'description' => 'Природный катаклизм, авария',                                                                                                        'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '9f7436db-6253-4718-aa61-b4676faa90c7', 'name' => 'Document',                  'description' => 'Некий документ, например написанный на бумаге.',                                                                                      'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', 'name' => 'Event',                    'description' => 'Какое то событие. Должно иметь время и место.',                                                                                       'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '5a626fa7-b69f-4042-9556-374f10df0a2c', 'name' => 'File',                     'description' => 'Файл на компьютерном устройстве',                                                                                                     'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'f9d434b8-28d9-45d5-bf19-a625319ea63b', 'name' => 'Fire',                     'description' => 'Пожар',                                                                                                                              'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '4f76b1b0-9de4-4c60-8e52-53fa429faabe', 'name' => 'Folder',                   'description' => 'Папка с файлами на компьютерном устройстве хранения',                                                                                 'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '6170d4e4-aab7-443b-baa1-f77dabc0e201', 'name' => 'Functional place',          'description' => 'Место, имеющее функциональное назначение, например дом, парк, завод, офис',                                                            'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '4ec0a490-9a24-491c-b0d7-c994d58fc468', 'name' => 'Galaxy',                   'description' => 'Галактика',                                                                                                                           'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'c0e229b8-6e56-45ee-b454-71e557cdb191', 'name' => 'Group',                    'description' => 'Группа людей, организация',                                                                                                          'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '90d97b01-ee65-4be5-ae27-fb9bec2aeedf', 'name' => 'Guitar',                   'description' => 'Гитара',                                                                                                                             'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '4c8ee41a-9912-4dff-8b44-7779a66e4fcf', 'name' => 'Human',                   'description' => 'Человек',                                                                                                                             'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '97bcbb9c-31f6-4c3c-913c-dfa54bce03e4', 'name' => 'Illness',                  'description' => 'Болезнь, недомогание',                                                                                                               'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '4b22a805-f3e1-47b9-bb87-b7a9f6f68cc4', 'name' => 'Image',                    'description' => 'Цифровое изображение, Фотография, как факт его создания.',                                                                             'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'e1a1a54a-f072-472b-8a64-e0322c39f418', 'name' => 'Internal class',            'description' => 'Для внутреннего логгирования и сервиса.',                                                                                              'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'e5b4c1b6-019b-4ab4-9387-cd54ca67048c', 'name' => 'is a part of',             'description' => '',                                                                                                                                   'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '7d548ec2-69e9-4329-b122-acb83cd83325', 'name' => 'Lake',                     'description' => 'Озеро',                                                                                                                              'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '4ed8a123-eceb-4c30-a8d6-c5694ce3d2f8', 'name' => 'List',                     'description' => '',                                                                                                                                   'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '71e49073-503f-4faa-932d-68ab89662420', 'name' => 'Live Being',               'description' => 'Что то живое',                                                                                                                        'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'eb8fbbab-1f92-42e6-b878-0519b9652ab6', 'name' => 'Married to',               'description' => 'состоит в браке с',                                                                                                                   'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'b42957b9-3a93-4092-ad99-811a8478a0d3', 'name' => 'meanwhile',                'description' => 'А в это время',                                                                                                                       'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'ac598f55-78b4-41c9-aaa6-32fa6a93d939', 'name' => 'Meeting',                  'description' => 'Встреча людей',                                                                                                                       'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '4fdcbd06-3233-4dcc-8259-fd6150cce007', 'name' => 'Music',                    'description' => 'Музыкальное произведение',                                                                                                            'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'caf05706-c73d-43e9-a496-6069f9aefc99', 'name' => 'Music band, artist',       'description' => 'Музыкальный коллектив, группа',                                                                                                       'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '52e2b5ce-562b-46eb-98b7-48703ed62a7e', 'name' => 'Music equipment',           'description' => 'Всё что годится для производства музыки',                                                                                              'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '860dd2fe-b70f-42b2-a446-20528245eeff', 'name' => 'Musician',                 'description' => 'Музыкант',                                                                                                                            'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '934efd3c-9781-4f2a-bd51-716a75cf5874', 'name' => 'Music Instrument',         'description' => 'Музыкальные инструменты',                                                                                                             'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '770b8c20-fb65-4896-9de6-21cecc03a332', 'name' => 'Performance',              'description' => 'Концерт, спектакль, выступление',                                                                                                     'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '4cc9a0fd-1ac2-4bc2-9f10-4fac1f90f376', 'name' => 'Photo Session',            'description' => 'Фотосессия или просто коллекция фото.',                                                                                                'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '69087526-c024-43a8-81bc-c067487e11bb', 'name' => 'Piece of art or work',     'description' => 'Что то созданное в процессе работы или творчества человека.',                                                                            'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'name' => 'Place',                    'description' => 'Некоторое место на земле или во вселенной ...',                                                                                         'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '3c7d2abc-3f31-4c73-bbbd-3e7b2e620630', 'name' => 'Planet',                  'description' => 'Планета, астероид, небесное тело',                                                                                                    'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'c38cad91-7747-4bbc-abd3-09b50e6e4672', 'name' => 'Product',                 'description' => 'Нечто, сделанное человеком',                                                                                                          'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '9c79e684-ec31-45e1-a51a-7bbedd0aa041', 'name' => 'Proof, evidence',          'description' => 'Ссылка на подтверждение, доказательство',                                                                                              'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'a31e2319-d8e0-4e48-98c8-3f23d0a17d50', 'name' => 'Region',                  'description' => 'Регион, область, штат',                                                                                                               'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '602f1b6b-1383-442b-908c-1a027d7a8010', 'name' => 'Restaurant, club, bar',    'description' => 'Клуб, бар, ресторан.',                                                                                                                'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '62e7ab56-4ebe-4002-a7f1-896e266b8078', 'name' => 'Sea',                      'description' => 'Море',                                                                                                                               'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '89539d56-fea3-4349-a3f2-f4cff229f879', 'name' => 'Service, repairment',      'description' => 'Починка, ремонт',                                                                                                                     'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'af6d4e0b-f452-442e-9fba-dcb60546b11d', 'name' => 'Sports activity',          'description' => '',                                                                                                                                   'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '8617d9c3-94fb-4f75-a983-1d8ba0822b0d', 'name' => 'Star system',              'description' => 'Звездная система',                                                                                                                    'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '7faa08e2-d882-4aa2-af0c-28c7d381030a', 'name' => 'Staying/Living in',        'description' => 'Нахождение в каком то месте в течение длительного периода.',                                                                             'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'd0eefbac-ce31-4bf1-b392-61e3a6d17ae5', 'name' => 'Street, road',             'description' => 'Улица, дорога',                                                                                                                       'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '298496fb-142b-4fc7-a844-7cb3fe9f9100', 'name' => 'System event',             'description' => 'Системное событие. Например импорт объекта.',                                                                                           'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '26570302-457d-4282-a949-9a9917515de3', 'name' => 'Task',                     'description' => 'Задача',                                                                                                                             'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'baeb5e5f-2659-4cb0-8260-55af9fadbe13', 'name' => 'Thing',                   'description' => 'Что то неживое, вещь',                                                                                                               'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'e3cad1b0-74fa-44b2-9b2f-2adaf36baa14', 'name' => 'Trip',                    'description' => 'Поездка, путешествие, событие с перемещением объектов',                                                                                 'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '11544624-be5c-4cdc-8fe1-701c09391464', 'name' => 'Vehicle',                  'description' => 'Транспорт',                                                                                                                           'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '7bdf2d4a-5329-4603-9562-b5c656d45306', 'name' => 'Vessel',                  'description' => 'Судно',                                                                                                                              'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'da17d697-d877-4625-8bcd-944570a21796', 'name' => 'Video',                    'description' => 'Видео',                                                                                                                              'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '2922e0c4-e82b-45e3-b85a-17619d75c37f', 'name' => 'Village',                 'description' => 'Деревня, село',                                                                                                                       'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '48140ccc-d6c4-456b-bc2b-793778e74465', 'name' => 'Walk',                    'description' => '',                                                                                                                                   'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'f989e699-dc6f-45f8-a985-145d28f68ffd', 'name' => 'Water area',               'description' => 'Некое водное пространство',                                                                                                           'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'aea400ce-a2e4-4d56-a3ba-3ab1bdd30e7a', 'name' => 'Writer',                   'description' => 'Писатель',                                                                                                                            'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'd6320bf5-ca8b-4e50-ad5c-873216d9fcf0', 'name' => 'Yacht',                    'description' => 'Яхта',                                                                                                                               'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => 'dbb3866e-e5a8-4186-b6e3-a273a42b1809', 'name' => 'Flat',                 'description' => 'Квартира, офис',                                                                                                                       'type' => UUID::G_CLASS, 'public' => true],
            ['thing_id' => '1fdf78e0-aa61-4e52-bbed-4ce157da78ab', 'name' => 'Sports section',         'description' => '',                                                                                                                                   'type' => UUID::G_CLASS, 'public' => true],
        ];

        foreach ($classes as $class) {
            DB::table('things')->upsert($class, ['thing_id'], ['name', 'description', 'public']);
        }

        // Class hierarchy links (LINK_TO_PARENT)
        $classLinks = [
            // Event → subclasses
            ['one_thing_id' => '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', 'other_thing_id' => '36255438-6a10-4036-8df3-7894801b2759', 'translation' => 'This is child of Event'],
            ['one_thing_id' => '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', 'other_thing_id' => '770b8c20-fb65-4896-9de6-21cecc03a332', 'translation' => 'Performance is subclass of Event'],
            ['one_thing_id' => '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', 'other_thing_id' => '7faa08e2-d882-4aa2-af0c-28c7d381030a', 'translation' => 'This is child of Event'],
            ['one_thing_id' => '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', 'other_thing_id' => '89539d56-fea3-4349-a3f2-f4cff229f879', 'translation' => 'This is child of Event'],
            ['one_thing_id' => '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', 'other_thing_id' => '960e0074-5945-4163-a9ba-576a09ced6da', 'translation' => 'This is child of Event'],
            ['one_thing_id' => '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', 'other_thing_id' => '97bcbb9c-31f6-4c3c-913c-dfa54bce03e4', 'translation' => 'Illness is a child of Event'],
            ['one_thing_id' => '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', 'other_thing_id' => 'ac598f55-78b4-41c9-aaa6-32fa6a93d939', 'translation' => 'Subclass of Event'],
            ['one_thing_id' => '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', 'other_thing_id' => 'af6d4e0b-f452-442e-9fba-dcb60546b11d', 'translation' => 'Object is of class'],
            ['one_thing_id' => '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', 'other_thing_id' => 'e3cad1b0-74fa-44b2-9b2f-2adaf36baa14', 'translation' => 'Trip is subclass of Event'],
            // Disaster → subclasses
            ['one_thing_id' => '36255438-6a10-4036-8df3-7894801b2759', 'other_thing_id' => 'f9d434b8-28d9-45d5-bf19-a625319ea63b', 'translation' => 'This is child of Disaster'],
            // Vehicle → subclasses
            ['one_thing_id' => '11544624-be5c-4cdc-8fe1-701c09391464', 'other_thing_id' => '4e605e49-3bbc-4bae-83fd-f1e7d7c76a77', 'translation' => 'Car is subclass of Vehicle'],
            ['one_thing_id' => '11544624-be5c-4cdc-8fe1-701c09391464', 'other_thing_id' => 'db91a470-2590-4f33-92bd-3e3dd33f5353', 'translation' => 'This is child of Vehicle'],
            // Car → subclasses
            ['one_thing_id' => '4e605e49-3bbc-4bae-83fd-f1e7d7c76a77', 'other_thing_id' => '5a0f67ea-a290-4ef6-9ac5-0e85d967c4f9', 'translation' => 'Opel Zafira B is a child of Car'],
            // Computer Data → subclasses
            ['one_thing_id' => '4e3b5c5f-f347-42d9-9e93-3093b420d2f5', 'other_thing_id' => '4f76b1b0-9de4-4c60-8e52-53fa429faabe', 'translation' => 'Folder is subclass of Computer Data'],
            ['one_thing_id' => '4e3b5c5f-f347-42d9-9e93-3093b420d2f5', 'other_thing_id' => '5a626fa7-b69f-4042-9556-374f10df0a2c', 'translation' => 'File is subclass of Computer Data'],
            ['one_thing_id' => '4e3b5c5f-f347-42d9-9e93-3093b420d2f5', 'other_thing_id' => 'ad3f8571-9b56-40af-b9c0-8d375f3b1976', 'translation' => 'Computer Media is subclass of Computer Data'],
            // Computer Media → subclasses
            ['one_thing_id' => 'ad3f8571-9b56-40af-b9c0-8d375f3b1976', 'other_thing_id' => '03d72750-32b4-4c52-8a59-37fbb93b3082', 'translation' => 'Audio is subclass of Computer Data'],
            ['one_thing_id' => 'ad3f8571-9b56-40af-b9c0-8d375f3b1976', 'other_thing_id' => '4b22a805-f3e1-47b9-bb87-b7a9f6f68cc4', 'translation' => 'Image is subclass of Computer Media'],
            ['one_thing_id' => 'ad3f8571-9b56-40af-b9c0-8d375f3b1976', 'other_thing_id' => 'da17d697-d877-4625-8bcd-944570a21796', 'translation' => 'Video is subclass of Computer Data'],
            // Something → subclasses
            ['one_thing_id' => '3e15244c-a9e1-4a91-a0ca-1c65722a64df', 'other_thing_id' => '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', 'translation' => 'Event is subclass of Something'],
            ['one_thing_id' => '3e15244c-a9e1-4a91-a0ca-1c65722a64df', 'other_thing_id' => '26570302-457d-4282-a949-9a9917515de3', 'translation' => 'Task is a child of Something'],
            ['one_thing_id' => '3e15244c-a9e1-4a91-a0ca-1c65722a64df', 'other_thing_id' => '4e3b5c5f-f347-42d9-9e93-3093b420d2f5', 'translation' => 'Computer Data is subclass of Something'],
            ['one_thing_id' => '3e15244c-a9e1-4a91-a0ca-1c65722a64df', 'other_thing_id' => '6a65dbf3-ad39-4446-8b8b-c0f539c1d53a', 'translation' => 'Collection is subclass of Something'],
            ['one_thing_id' => '3e15244c-a9e1-4a91-a0ca-1c65722a64df', 'other_thing_id' => '71e49073-503f-4faa-932d-68ab89662420', 'translation' => 'Live Being is subclass of Something'],
            ['one_thing_id' => '3e15244c-a9e1-4a91-a0ca-1c65722a64df', 'other_thing_id' => '9f7436db-6253-4718-aa61-b4676faa90c7', 'translation' => 'This is child of Something'],
            ['one_thing_id' => '3e15244c-a9e1-4a91-a0ca-1c65722a64df', 'other_thing_id' => 'baeb5e5f-2659-4cb0-8260-55af9fadbe13', 'translation' => 'Thing is subclass of Something'],
            ['one_thing_id' => '3e15244c-a9e1-4a91-a0ca-1c65722a64df', 'other_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'translation' => 'Place is subclass of Something'],
            ['one_thing_id' => '3e15244c-a9e1-4a91-a0ca-1c65722a64df', 'other_thing_id' => 'f48ef10a-40f6-4190-bfae-2834e9781ad1', 'translation' => 'This is child of Something'],
            // Collection → subclasses
            ['one_thing_id' => '6a65dbf3-ad39-4446-8b8b-c0f539c1d53a', 'other_thing_id' => '4ed8a123-eceb-4c30-a8d6-c5694ce3d2f8', 'translation' => 'List is a child of Collection'],
            ['one_thing_id' => '6a65dbf3-ad39-4446-8b8b-c0f539c1d53a', 'other_thing_id' => 'c0e229b8-6e56-45ee-b454-71e557cdb191', 'translation' => 'Group is subclass of Collection'],
            // Group → subclasses
            ['one_thing_id' => 'c0e229b8-6e56-45ee-b454-71e557cdb191', 'other_thing_id' => '1fdf78e0-aa61-4e52-bbed-4ce157da78ab', 'translation' => 'Спортивная секция is a child of Group'],
            ['one_thing_id' => 'c0e229b8-6e56-45ee-b454-71e557cdb191', 'other_thing_id' => '2067c7bf-0f6f-491d-af2b-10105db4e8cc', 'translation' => 'This is child of Group'],
            ['one_thing_id' => 'c0e229b8-6e56-45ee-b454-71e557cdb191', 'other_thing_id' => 'caf05706-c73d-43e9-a496-6069f9aefc99', 'translation' => 'Music band is of class Group'],
            // List → subclasses
            ['one_thing_id' => '4ed8a123-eceb-4c30-a8d6-c5694ce3d2f8', 'other_thing_id' => '8ac2606d-d008-4588-8b9a-09a79ee5f44a', 'translation' => 'Music Performance Set list is a child of List'],
            // Live Being → subclasses
            ['one_thing_id' => '71e49073-503f-4faa-932d-68ab89662420', 'other_thing_id' => '4c8ee41a-9912-4dff-8b44-7779a66e4fcf', 'translation' => 'Human is subclass of Live Being'],
            // Character → subclasses
            ['one_thing_id' => 'f48ef10a-40f6-4190-bfae-2834e9781ad1', 'other_thing_id' => '860dd2fe-b70f-42b2-a446-20528245eeff', 'translation' => 'This is child of Character'],
            ['one_thing_id' => 'f48ef10a-40f6-4190-bfae-2834e9781ad1', 'other_thing_id' => 'aea400ce-a2e4-4d56-a3ba-3ab1bdd30e7a', 'translation' => 'This is child of Character'],
            // Thing → subclasses
            ['one_thing_id' => 'baeb5e5f-2659-4cb0-8260-55af9fadbe13', 'other_thing_id' => '69087526-c024-43a8-81bc-c067487e11bb', 'translation' => 'This is child of Thing'],
            ['one_thing_id' => 'baeb5e5f-2659-4cb0-8260-55af9fadbe13', 'other_thing_id' => 'c38cad91-7747-4bbc-abd3-09b50e6e4672', 'translation' => 'This is child of Thing'],
            // Piece of art or work → subclasses
            ['one_thing_id' => '69087526-c024-43a8-81bc-c067487e11bb', 'other_thing_id' => '4fdcbd06-3233-4dcc-8259-fd6150cce007', 'translation' => 'Music is a child of Piece of art or work'],
            ['one_thing_id' => '69087526-c024-43a8-81bc-c067487e11bb', 'other_thing_id' => 'fb8d457c-62b4-43e9-9e4d-014201176f01', 'translation' => 'This is child of Piece of art or work'],
            // Product → subclasses
            ['one_thing_id' => 'c38cad91-7747-4bbc-abd3-09b50e6e4672', 'other_thing_id' => '11544624-be5c-4cdc-8fe1-701c09391464', 'translation' => 'This is child of Product'],
            ['one_thing_id' => 'c38cad91-7747-4bbc-abd3-09b50e6e4672', 'other_thing_id' => '52e2b5ce-562b-46eb-98b7-48703ed62a7e', 'translation' => 'This is child of Product'],
            ['one_thing_id' => 'c38cad91-7747-4bbc-abd3-09b50e6e4672', 'other_thing_id' => '7bdf2d4a-5329-4603-9562-b5c656d45306', 'translation' => 'Vessel is a child of Product'],
            ['one_thing_id' => 'c38cad91-7747-4bbc-abd3-09b50e6e4672', 'other_thing_id' => 'ea7aed7a-8cdf-45e4-9896-43c57ffdf132', 'translation' => 'Computing Device is a child of Product'],
            // Vessel → subclasses
            ['one_thing_id' => '7bdf2d4a-5329-4603-9562-b5c656d45306', 'other_thing_id' => 'd6320bf5-ca8b-4e50-ad5c-873216d9fcf0', 'translation' => 'Yacht is a child of Vessel'],
            // Music equipment → subclasses
            ['one_thing_id' => '52e2b5ce-562b-46eb-98b7-48703ed62a7e', 'other_thing_id' => '934efd3c-9781-4f2a-bd51-716a75cf5874', 'translation' => 'This is child of Music Equipment'],
            ['one_thing_id' => '52e2b5ce-562b-46eb-98b7-48703ed62a7e', 'other_thing_id' => 'dbd6eec5-9df1-473b-bf65-42e68f4e5d7b', 'translation' => 'This is child of Music equipment'],
            // Music Instrument → subclasses
            ['one_thing_id' => '934efd3c-9781-4f2a-bd51-716a75cf5874', 'other_thing_id' => '90d97b01-ee65-4be5-ae27-fb9bec2aeedf', 'translation' => 'This is child of Music Instrument'],
            // Guitar → subclasses
            ['one_thing_id' => '90d97b01-ee65-4be5-ae27-fb9bec2aeedf', 'other_thing_id' => '81aa3a58-1a61-4a83-9046-6f5ec836a347', 'translation' => 'Это гитара'],
            // Guitar processor → subclasses
            ['one_thing_id' => 'dbd6eec5-9df1-473b-bf65-42e68f4e5d7b', 'other_thing_id' => 'cf74b151-7161-4f80-b4e5-41b2de69c6ca', 'translation' => 'This is child of Guitar processor'],
            // Place → subclasses
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => '14cd9c8b-84a4-4fd2-82a8-97477ff2d5ee', 'translation' => 'This is child of Place'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => '20f6b1ae-86de-4221-bf0c-995be2687405', 'translation' => 'This is child of Place'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => '2922e0c4-e82b-45e3-b85a-17619d75c37f', 'translation' => 'Object is of class'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => '3c7d2abc-3f31-4c73-bbbd-3e7b2e620630', 'translation' => 'This is child of Place'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => '4ec0a490-9a24-491c-b0d7-c994d58fc468', 'translation' => 'This is child of Place'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => '5787ef00-3f6b-46fe-9e93-d32c9ebdeab4', 'translation' => 'This is child of Place'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => '602f1b6b-1383-442b-908c-1a027d7a8010', 'translation' => 'Restaurant, club, bar is subclass of Place'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => '6170d4e4-aab7-443b-baa1-f77dabc0e201', 'translation' => 'Functional place is a child of Place'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => '73482bbe-d377-4e01-9efb-de135916c94a', 'translation' => 'This is child of Place'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => '8617d9c3-94fb-4f75-a983-1d8ba0822b0d', 'translation' => 'This is child of Place'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => 'a31e2319-d8e0-4e48-98c8-3f23d0a17d50', 'translation' => 'This is child of Place'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => 'ad4be260-0af0-4e7c-928e-a7177158e1d0', 'translation' => 'This is child of Place'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => 'd0eefbac-ce31-4bf1-b392-61e3a6d17ae5', 'translation' => 'This is child of Place'],
            ['one_thing_id' => 'dc006cda-047a-4862-acf7-e215355b6890', 'other_thing_id' => 'f989e699-dc6f-45f8-a985-145d28f68ffd', 'translation' => 'This is child of Place'],
            // Квартира → subclasses
            ['one_thing_id' => 'dbb3866e-e5a8-4186-b6e3-a273a42b1809', 'other_thing_id' => '6170d4e4-aab7-443b-baa1-f77dabc0e201', 'translation' => 'Functional place is a child of Квартира'],
            // Water area → subclasses
            ['one_thing_id' => 'f989e699-dc6f-45f8-a985-145d28f68ffd', 'other_thing_id' => '62e7ab56-4ebe-4002-a7f1-896e266b8078', 'translation' => 'This is child of Water area'],
            ['one_thing_id' => 'f989e699-dc6f-45f8-a985-145d28f68ffd', 'other_thing_id' => '7d548ec2-69e9-4329-b122-acb83cd83325', 'translation' => 'This is child of Water area'],
            // Internal class → subclasses
            ['one_thing_id' => 'e1a1a54a-f072-472b-8a64-e0322c39f418', 'other_thing_id' => 'c532f6ba-27b2-43ec-b4ec-30cbff78eed0', 'translation' => 'This is child of Internal class'],
        ];

        foreach ($classLinks as $link) {
            $exists = DB::table('links')
                ->where('one_thing_id', $link['one_thing_id'])
                ->where('link_type_id', UUID::LINK_TO_PARENT)
                ->where('other_thing_id', $link['other_thing_id'])
                ->exists();

            if (!$exists) {
                DB::table('links')->insert([
                    'one_thing_id'   => $link['one_thing_id'],
                    'link_type_id'   => UUID::LINK_TO_PARENT,
                    'other_thing_id' => $link['other_thing_id'],
                    'translation'    => $link['translation'],
                ]);
            }
        }

        // ============================================================
        // Environment-specific seeders
        // ============================================================
        if (app()->environment('testing')) {
            $this->call(TestDatabaseSeeder::class);
        }
    }
}
