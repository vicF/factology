// packages/engine/src/localDb/seedData.js
//
// Seed data for the local (standalone/offline) mode.
// Source of truth: database/seeders/DatabaseSeeder.php
//
// ⚠️ Keep in sync with DatabaseSeeder.php — the arrays below mirror the
// PHP bootstrap things/links, the class list and the class hierarchy links
// exactly (same thing_ids, names, and parent→child edges). The drift test
// (tests-vitest/localDb/schemaDrift.test.js) guards schema columns;
// seederParity.test.js guards that every entry here is actually inserted.

import { UUID } from '../constants/uuid.js';

// ── Bootstrap things (infrastructure records referenced by code) ──────
export const BOOTSTRAP_THINGS = [
    {
        thing_id: UUID.EVERYTHING,
        name: 'Everything',
        description: 'base object for everything',
        type: UUID.G_CLASS,
        public: true,
    },
    {
        thing_id: UUID.LINK,
        name: 'Link',
        description: 'base object for links',
        type: UUID.G_LINK,
        public: true,
    },
    {
        thing_id: UUID.LINK_TO_PARENT,
        name: 'is a superclass of',
        description: 'The object is a more general class/category that the linked object subclasses',
        type: UUID.G_LINK,
        public: true,
    },
    {
        thing_id: UUID.LINK_TO_CLASS,
        name: 'is of class',
        description: 'Link to a class of an object',
        type: UUID.G_LINK,
        public: true,
    },
    {
        thing_id: UUID.SOMETHING,
        name: 'Something',
        description: 'base class for all other classes',
        type: UUID.G_CLASS,
        public: true,
    },
    {
        thing_id: UUID.USER,
        name: 'User',
        description: 'base class for user objects',
        type: UUID.G_CLASS,
        public: true,
    },
    {
        thing_id: UUID.SYSTEM,
        name: 'System',
        description: 'system class',
        type: UUID.G_CLASS,
        public: true,
    },
    {
        thing_id: UUID.VICTOR_FOKIN,
        name: 'Victor Fokin',
        description: 'System creator',
        type: UUID.GENERAL,
        public: false,
        // Victor Fokin is an ordinary identity — the row represents that
        // person and is owned by him, NOT by the system (SYSTEM_OWNER).
        owner: UUID.VICTOR_FOKIN,
    },
    {
        thing_id: UUID.GROUP_READ_ACCESS,
        name: 'Group read access',
        description: 'Link type for group-based read access control',
        type: UUID.G_LINK,
        public: true,
    },
    {
        thing_id: UUID.BELONGS_TO_USER_GROUP,
        name: 'Belongs to user group',
        description: 'Link type for user-to-group membership',
        type: UUID.G_LINK,
        public: true,
    },
    // GEDCOM importer link types (mirror dev2 migrations/seed taxonomy)
    {
        thing_id: UUID.IMPORTED_FROM,
        name: 'imported from',
        description: 'Объект был импортирован из внешнего источника данных',
        type: UUID.G_LINK,
        public: true,
    },
    {
        thing_id: UUID.PRESENT,
        name: 'participates in',
        description: 'Person participates in an event (участвует в)',
        type: UUID.G_LINK,
        public: true,
    },
    {
        thing_id: UUID.INSIDE,
        name: 'inside',
        description: 'Object is inside / located within a place',
        type: UUID.G_LINK,
        public: true,
    },
    {
        thing_id: UUID.EVIDENCE,
        name: 'is evidenced by',
        description: 'Statement/object is evidenced by a source (подтверждается источником)',
        type: UUID.G_LINK,
        public: true,
    },
    {
        thing_id: UUID.FATHER,
        name: 'father',
        description: 'is father of',
        type: UUID.G_LINK,
        public: true,
    },
    {
        thing_id: UUID.MOTHER,
        name: 'mother',
        description: 'is mother of',
        type: UUID.G_LINK,
        public: true,
    },
];

// ── Bootstrap links (top-level class hierarchy edges) ─────────────────
export const BOOTSTRAP_LINKS = [
    { one: UUID.EVERYTHING, other: UUID.SOMETHING,      description: '"Something" is subclass of "Everything"' },
    { one: UUID.EVERYTHING, other: UUID.LINK,           description: '"Link" is subclass of "Everything"' },
    { one: UUID.EVERYTHING, other: UUID.SYSTEM,         description: '"System" is subclass of "Everything"' },
    { one: UUID.LINK,       other: UUID.LINK_TO_PARENT, description: '"Superclass" is subclass of "Link"' },
    { one: UUID.LINK,       other: UUID.LINK_TO_CLASS,  description: '"Class of" is subclass of "Link"' },
    // GEDCOM importer link types live under the Link root (mirror dev2).
    { one: UUID.LINK,       other: UUID.IMPORTED_FROM,  description: '"Imported from" is subclass of "Link"' },
    { one: UUID.LINK,       other: UUID.PRESENT,        description: '"Participates in" is subclass of "Link"' },
    { one: UUID.LINK,       other: UUID.INSIDE,         description: '"Inside" is subclass of "Link"' },
    { one: UUID.LINK,       other: UUID.EVIDENCE,       description: '"Is evidenced by" is subclass of "Link"' },
    { one: UUID.LINK,       other: UUID.FATHER,         description: '"Father" is subclass of "Link"' },
    { one: UUID.LINK,       other: UUID.MOTHER,         description: '"Mother" is subclass of "Link"' },
];

// ── Classes (public G_CLASS things) — mirrors DatabaseSeeder.php ──────
// Instances referenced by the class hierarchy links are also listed.
export const CLASSES = [
    { thing_id: 'c532f6ba-27b2-43ec-b4ec-30cbff78eed0', name: 'Access group',             description: 'Группа для доступа к ресурсам. Члены этой группы имеют доступ к ресурсам, с которыми эта группа связана. Экспериментально!', type: UUID.G_CLASS, public: true },
    { thing_id: '03d72750-32b4-4c52-8a59-37fbb93b3082', name: 'Audio',                    description: 'аудио',                                                                                                                              type: UUID.G_CLASS, public: true },
    { thing_id: 'fb8d457c-62b4-43e9-9e4d-014201176f01', name: 'Book',                     description: 'Книга',                                                                                                                              type: UUID.G_CLASS, public: true },
    { thing_id: '5787ef00-3f6b-46fe-9e93-d32c9ebdeab4', name: 'Building, house',          description: 'Дом, строение',                                                                                                                      type: UUID.G_CLASS, public: true },
    { thing_id: 'db91a470-2590-4f33-92bd-3e3dd33f5353', name: 'Bicycle',                  description: 'Велосипед',                                                                                                                          type: UUID.G_CLASS, public: true },
    { thing_id: '4e605e49-3bbc-4bae-83fd-f1e7d7c76a77', name: 'Car',                      description: 'автомобиль',                                                                                                                         type: UUID.G_CLASS, public: true },
    { thing_id: 'f48ef10a-40f6-4190-bfae-2834e9781ad1', name: 'Character',                description: 'Некий персонаж, действующее лицо, вымышленный или настоящий.',                                                                       type: UUID.G_CLASS, public: true },
    { thing_id: '960e0074-5945-4163-a9ba-576a09ced6da', name: 'Visit',                    description: 'Посещение какого то места',                                                                                                          type: UUID.G_CLASS, public: true },
    { thing_id: '14cd9c8b-84a4-4fd2-82a8-97477ff2d5ee', name: 'City',                     description: 'Город',                                                                                                                              type: UUID.G_CLASS, public: true },
    { thing_id: '6a65dbf3-ad39-4446-8b8b-c0f539c1d53a', name: 'Collection',               description: 'Коллекция, список',                                                                                                                  type: UUID.G_CLASS, public: true },
    { thing_id: '2067c7bf-0f6f-491d-af2b-10105db4e8cc', name: 'Company',                  description: 'Компания, бренд',                                                                                                                    type: UUID.G_CLASS, public: true },
    { thing_id: '4e3b5c5f-f347-42d9-9e93-3093b420d2f5', name: 'Digital Data',            description: 'Некие компьютерные данные. Файл, папка.',                                                                                             type: UUID.G_CLASS, public: true },
    { thing_id: 'ad3f8571-9b56-40af-b9c0-8d375f3b1976', name: 'Media',                   description: 'Фото, видео, аудио и т.п.',                                                                                                          type: UUID.G_CLASS, public: true },
    { thing_id: 'ea7aed7a-8cdf-45e4-9896-43c57ffdf132', name: 'Computing Device',         description: 'Компьютер, смартфон или что то ещё такое вычислительное',                                                                              type: UUID.G_CLASS, public: true },
    { thing_id: 'ad4be260-0af0-4e7c-928e-a7177158e1d0', name: 'Continent',                description: 'Континетн',                                                                                                                          type: UUID.G_CLASS, public: true },
    { thing_id: '20f6b1ae-86de-4221-bf0c-995be2687405', name: 'Country',                  description: 'Страна',                                                                                                                             type: UUID.G_CLASS, public: true },
    { thing_id: '73482bbe-d377-4e01-9efb-de135916c94a', name: 'Country place',             description: 'Некая область на карте, имеющая название',                                                                                            type: UUID.G_CLASS, public: true },
    { thing_id: '36255438-6a10-4036-8df3-7894801b2759', name: 'Disaster',                  description: 'Природный катаклизм, авария',                                                                                                        type: UUID.G_CLASS, public: true },
    { thing_id: '9f7436db-6253-4718-aa61-b4676faa90c7', name: 'Document',                  description: 'Некий документ, например написанный на бумаге.',                                                                                      type: UUID.G_CLASS, public: true },
    { thing_id: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', name: 'Event',                    description: 'Какое то событие. Должно иметь время и место.',                                                                                       type: UUID.G_CLASS, public: true },
    { thing_id: '5a626fa7-b69f-4042-9556-374f10df0a2c', name: 'File',                     description: 'Файл на компьютерном устройстве',                                                                                                     type: UUID.G_CLASS, public: true },
    { thing_id: 'f9d434b8-28d9-45d5-bf19-a625319ea63b', name: 'Fire',                     description: 'Пожар',                                                                                                                              type: UUID.G_CLASS, public: true },
    { thing_id: '4f76b1b0-9de4-4c60-8e52-53fa429faabe', name: 'Folder',                   description: 'Папка с файлами на компьютерном устройстве хранения',                                                                                 type: UUID.G_CLASS, public: true },
    { thing_id: '6170d4e4-aab7-443b-baa1-f77dabc0e201', name: 'Functional place',          description: 'Место, имеющее функциональное назначение, например дом, парк, завод, офис',                                                            type: UUID.G_CLASS, public: true },
    { thing_id: '4ec0a490-9a24-491c-b0d7-c994d58fc468', name: 'Galaxy',                   description: 'Галактика',                                                                                                                           type: UUID.G_CLASS, public: true },
    { thing_id: 'c0e229b8-6e56-45ee-b454-71e557cdb191', name: 'Group',                    description: 'Группа людей, организация',                                                                                                          type: UUID.G_CLASS, public: true },
    { thing_id: '90d97b01-ee65-4be5-ae27-fb9bec2aeedf', name: 'Guitar',                   description: 'Гитара',                                                                                                                             type: UUID.G_CLASS, public: true },
    { thing_id: '4c8ee41a-9912-4dff-8b44-7779a66e4fcf', name: 'Human',                   description: 'Человек',                                                                                                                             type: UUID.G_CLASS, public: true },
    { thing_id: '97bcbb9c-31f6-4c3c-913c-dfa54bce03e4', name: 'Illness',                  description: 'Болезнь, недомогание',                                                                                                               type: UUID.G_CLASS, public: true },
    { thing_id: '4b22a805-f3e1-47b9-bb87-b7a9f6f68cc4', name: 'Image',                    description: 'Цифровое изображение, Фотография, как факт его создания.',                                                                             type: UUID.G_CLASS, public: true },
    { thing_id: 'e5b4c1b6-019b-4ab4-9387-cd54ca67048c', name: 'is a part of',             description: '',                                                                                                                                   type: UUID.G_LINK, public: true },
    { thing_id: '7d548ec2-69e9-4329-b122-acb83cd83325', name: 'Lake',                     description: 'Озеро',                                                                                                                              type: UUID.G_CLASS, public: true },
    { thing_id: '4ed8a123-eceb-4c30-a8d6-c5694ce3d2f8', name: 'List',                     description: '',                                                                                                                                   type: UUID.G_CLASS, public: true },
    { thing_id: '71e49073-503f-4faa-932d-68ab89662420', name: 'Living being',            description: 'Что то живое',                                                                                                                        type: UUID.G_CLASS, public: true },
    { thing_id: 'eb8fbbab-1f92-42e6-b878-0519b9652ab6', name: 'Married to',               description: 'состоит в браке с',                                                                                                                   type: UUID.G_CLASS, public: true },
    { thing_id: 'b42957b9-3a93-4092-ad99-811a8478a0d3', name: 'meanwhile',                description: 'А в это время',                                                                                                                       type: UUID.G_CLASS, public: true },
    { thing_id: 'ac598f55-78b4-41c9-aaa6-32fa6a93d939', name: 'Meeting',                  description: 'Встреча людей',                                                                                                                       type: UUID.G_CLASS, public: true },
    { thing_id: '4fdcbd06-3233-4dcc-8259-fd6150cce007', name: 'Music',                    description: 'Музыкальное произведение',                                                                                                            type: UUID.G_CLASS, public: true },
    { thing_id: 'caf05706-c73d-43e9-a496-6069f9aefc99', name: 'Music band',              description: 'Музыкальный коллектив, группа',                                                                                                       type: UUID.G_CLASS, public: true },
    { thing_id: '52e2b5ce-562b-46eb-98b7-48703ed62a7e', name: 'Music equipment',           description: 'Всё что годится для производства музыки',                                                                                              type: UUID.G_CLASS, public: true },
    { thing_id: '860dd2fe-b70f-42b2-a446-20528245eeff', name: 'Musician',                 description: 'Музыкант',                                                                                                                            type: UUID.G_CLASS, public: true },
    { thing_id: '934efd3c-9781-4f2a-bd51-716a75cf5874', name: 'Musical instrument',       description: 'Музыкальные инструменты',                                                                                                             type: UUID.G_CLASS, public: true },
    { thing_id: '770b8c20-fb65-4896-9de6-21cecc03a332', name: 'Performance',              description: 'Концерт, спектакль, выступление',                                                                                                     type: UUID.G_CLASS, public: true },
    { thing_id: '4cc9a0fd-1ac2-4bc2-9f10-4fac1f90f376', name: 'Photo Session',            description: 'Фотосессия или просто коллекция фото.',                                                                                                type: UUID.G_CLASS, public: true },
    { thing_id: '69087526-c024-43a8-81bc-c067487e11bb', name: 'Creative work',           description: 'Что то созданное в процессе работы или творчества человека.',                                                                            type: UUID.G_CLASS, public: true },
    { thing_id: 'dc006cda-047a-4862-acf7-e215355b6890', name: 'Place',                    description: 'Некоторое место на земле или во вселенной ...',                                                                                         type: UUID.G_CLASS, public: true },
    { thing_id: '3c7d2abc-3f31-4c73-bbbd-3e7b2e620630', name: 'Planet',                  description: 'Планета, астероид, небесное тело',                                                                                                    type: UUID.G_CLASS, public: true },
    { thing_id: 'c38cad91-7747-4bbc-abd3-09b50e6e4672', name: 'Product',                 description: 'Нечто, сделанное человеком',                                                                                                          type: UUID.G_CLASS, public: true },
    { thing_id: '9c79e684-ec31-45e1-a51a-7bbedd0aa041', name: 'Proof, evidence',          description: 'Ссылка на подтверждение, доказательство',                                                                                              type: UUID.G_CLASS, public: true },
    { thing_id: 'a31e2319-d8e0-4e48-98c8-3f23d0a17d50', name: 'Region',                  description: 'Регион, область, штат',                                                                                                               type: UUID.G_CLASS, public: true },
    { thing_id: '602f1b6b-1383-442b-908c-1a027d7a8010', name: 'Restaurant, club, bar',    description: 'Клуб, бар, ресторан.',                                                                                                                type: UUID.G_CLASS, public: true },
    { thing_id: '62e7ab56-4ebe-4002-a7f1-896e266b8078', name: 'Sea',                      description: 'Море',                                                                                                                               type: UUID.G_CLASS, public: true },
    { thing_id: UUID.G_SERVER_CLASS,                   name: 'Server',                   description: 'Сервер или другое устройство/приложение, работающее от имени этого сервера',                                                       type: UUID.G_CLASS, public: true },
    { thing_id: '89539d56-fea3-4349-a3f2-f4cff229f879', name: 'Service, repairment',      description: 'Починка, ремонт',                                                                                                                     type: UUID.G_CLASS, public: true },
    { thing_id: 'af6d4e0b-f452-442e-9fba-dcb60546b11d', name: 'Sports activity',          description: '',                                                                                                                                   type: UUID.G_CLASS, public: true },
    { thing_id: '8617d9c3-94fb-4f75-a983-1d8ba0822b0d', name: 'Star system',              description: 'Звездная система',                                                                                                                    type: UUID.G_CLASS, public: true },
    { thing_id: 'a70ae070-0c52-4a89-84a0-5c76f76e5aa7', name: 'Residence',               description: 'Проживание, нахождение в каком то месте в течение длительного периода.',                                                                  type: UUID.G_CLASS, public: true },
    { thing_id: 'd0eefbac-ce31-4bf1-b392-61e3a6d17ae5', name: 'Street, road',             description: 'Улица, дорога',                                                                                                                       type: UUID.G_CLASS, public: true },
    { thing_id: '298496fb-142b-4fc7-a844-7cb3fe9f9100', name: 'System event',             description: 'Системное событие. Например импорт объекта.',                                                                                           type: UUID.G_CLASS, public: true },
    { thing_id: '26570302-457d-4282-a949-9a9917515de3', name: 'Task',                     description: 'Задача',                                                                                                                             type: UUID.G_CLASS, public: true },
    { thing_id: 'baeb5e5f-2659-4cb0-8260-55af9fadbe13', name: 'Object',                  description: 'Что то неживое, вещь',                                                                                                               type: UUID.G_CLASS, public: true },
    { thing_id: 'e3cad1b0-74fa-44b2-9b2f-2adaf36baa14', name: 'Trip',                    description: 'Поездка, путешествие, событие с перемещением объектов',                                                                                 type: UUID.G_CLASS, public: true },
    { thing_id: '11544624-be5c-4cdc-8fe1-701c09391464', name: 'Vehicle',                  description: 'Транспорт',                                                                                                                           type: UUID.G_CLASS, public: true },
    { thing_id: '7bdf2d4a-5329-4603-9562-b5c656d45306', name: 'Vessel',                  description: 'Судно',                                                                                                                              type: UUID.G_CLASS, public: true },
    { thing_id: 'da17d697-d877-4625-8bcd-944570a21796', name: 'Video',                    description: 'Видео',                                                                                                                              type: UUID.G_CLASS, public: true },
    { thing_id: '2922e0c4-e82b-45e3-b85a-17619d75c37f', name: 'Village',                 description: 'Деревня, село',                                                                                                                       type: UUID.G_CLASS, public: true },
    { thing_id: '48140ccc-d6c4-456b-bc2b-793778e74465', name: 'Walk',                    description: '',                                                                                                                                   type: UUID.G_CLASS, public: true },
    { thing_id: 'f989e699-dc6f-45f8-a985-145d28f68ffd', name: 'Water body',              description: 'Некое водное пространство',                                                                                                           type: UUID.G_CLASS, public: true },
    { thing_id: 'aea400ce-a2e4-4d56-a3ba-3ab1bdd30e7a', name: 'Writer',                   description: 'Писатель',                                                                                                                            type: UUID.G_CLASS, public: true },
    { thing_id: 'd6320bf5-ca8b-4e50-ad5c-873216d9fcf0', name: 'Yacht',                    description: 'Яхта',                                                                                                                               type: UUID.G_CLASS, public: true },
    { thing_id: 'dbb3866e-e5a8-4186-b6e3-a273a42b1809', name: 'Flat',                 description: 'Квартира, офис',                                                                                                                       type: UUID.G_CLASS, public: true },
    { thing_id: '1fdf78e0-aa61-4e52-bbed-4ce157da78ab', name: 'Sports section',         description: '',                                                                                                                                   type: UUID.G_CLASS, public: true },
    // ── GEDCOM event classes (children of Event) + Address (child of Place) ──
    { thing_id: UUID.BIRTH_CLASS,       name: 'Birth',          description: 'Birth of a person',                                                                      type: UUID.G_CLASS, public: true },
    { thing_id: UUID.DEATH_CLASS,       name: 'Death',          description: 'Death of a person',                                                                      type: UUID.G_CLASS, public: true },
    { thing_id: UUID.OCCUPATION_CLASS,  name: 'Occupation',     description: 'Occupation / work',                                                                      type: UUID.G_CLASS, public: true },
    { thing_id: UUID.MARRIAGE_CLASS,    name: 'Marriage',       description: 'Marriage',                                                                               type: UUID.G_CLASS, public: true },
    { thing_id: UUID.BURIAL_CLASS,      name: 'Burial',         description: 'Burial',                                                                                 type: UUID.G_CLASS, public: true },
    { thing_id: UUID.EDUCATION_CLASS,   name: 'Education',      description: 'Education',                                                                              type: UUID.G_CLASS, public: true },
    { thing_id: UUID.CHRISTENING_CLASS, name: 'Christening',    description: 'Christening / baptism',                                                                  type: UUID.G_CLASS, public: true },
    { thing_id: UUID.ADDRESS_CLASS,     name: 'Address',        description: 'Postal / street address',                                                                type: UUID.G_CLASS, public: true },
    { thing_id: UUID.GEDCOM_CLASS,      name: 'GEDCOM',         description: 'A GEDCOM genealogy file or other external data source',                                  type: UUID.G_CLASS, public: true },
];

// ── Class hierarchy links (LINK_TO_PARENT edges) — mirrors DatabaseSeeder.php ──
// one = parent class, other = subclass.
export const CLASS_LINKS = [
    // Event → subclasses
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: '36255438-6a10-4036-8df3-7894801b2759', description: 'This is child of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: '770b8c20-fb65-4896-9de6-21cecc03a332', description: 'Performance is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: 'a70ae070-0c52-4a89-84a0-5c76f76e5aa7', description: 'Residence is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: '4cc9a0fd-1ac2-4bc2-9f10-4fac1f90f376', description: 'Photo session is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: '89539d56-fea3-4349-a3f2-f4cff229f879', description: 'This is child of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: '960e0074-5945-4163-a9ba-576a09ced6da', description: 'This is child of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: '97bcbb9c-31f6-4c3c-913c-dfa54bce03e4', description: 'Illness is a child of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: 'ac598f55-78b4-41c9-aaa6-32fa6a93d939', description: 'Subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: 'af6d4e0b-f452-442e-9fba-dcb60546b11d', description: 'Object is of class' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: 'e3cad1b0-74fa-44b2-9b2f-2adaf36baa14', description: 'Trip is subclass of Event' },
    // Disaster → subclasses
    { one: '36255438-6a10-4036-8df3-7894801b2759', other: 'f9d434b8-28d9-45d5-bf19-a625319ea63b', description: 'This is child of Disaster' },
    // Vehicle → subclasses
    { one: '11544624-be5c-4cdc-8fe1-701c09391464', other: '4e605e49-3bbc-4bae-83fd-f1e7d7c76a77', description: 'Car is subclass of Vehicle' },
    { one: '11544624-be5c-4cdc-8fe1-701c09391464', other: 'db91a470-2590-4f33-92bd-3e3dd33f5353', description: 'This is child of Vehicle' },
    // Computer Data → subclasses
    { one: '4e3b5c5f-f347-42d9-9e93-3093b420d2f5', other: '4f76b1b0-9de4-4c60-8e52-53fa429faabe', description: 'Folder is subclass of Computer Data' },
    { one: '4e3b5c5f-f347-42d9-9e93-3093b420d2f5', other: '5a626fa7-b69f-4042-9556-374f10df0a2c', description: 'File is subclass of Computer Data' },
    { one: '4e3b5c5f-f347-42d9-9e93-3093b420d2f5', other: 'ad3f8571-9b56-40af-b9c0-8d375f3b1976', description: 'Computer Media is subclass of Computer Data' },
    // Computer Media → subclasses
    { one: 'ad3f8571-9b56-40af-b9c0-8d375f3b1976', other: '03d72750-32b4-4c52-8a59-37fbb93b3082', description: 'Audio is subclass of Computer Data' },
    { one: 'ad3f8571-9b56-40af-b9c0-8d375f3b1976', other: '4b22a805-f3e1-47b9-bb87-b7a9f6f68cc4', description: 'Image is subclass of Computer Media' },
    { one: 'ad3f8571-9b56-40af-b9c0-8d375f3b1976', other: 'da17d697-d877-4625-8bcd-944570a21796', description: 'Video is subclass of Computer Data' },
    // Something → subclasses
    { one: UUID.SOMETHING, other: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', description: 'Event is subclass of Something' },
    { one: UUID.SOMETHING, other: '26570302-457d-4282-a949-9a9917515de3', description: 'Task is a child of Something' },
    { one: UUID.SOMETHING, other: '4e3b5c5f-f347-42d9-9e93-3093b420d2f5', description: 'Computer Data is subclass of Something' },
    { one: UUID.SOMETHING, other: '6a65dbf3-ad39-4446-8b8b-c0f539c1d53a', description: 'Collection is subclass of Something' },
    { one: UUID.SOMETHING, other: '71e49073-503f-4faa-932d-68ab89662420', description: 'Live Being is subclass of Something' },
    { one: UUID.SOMETHING, other: '9f7436db-6253-4718-aa61-b4676faa90c7', description: 'This is child of Something' },
    { one: UUID.SOMETHING, other: 'baeb5e5f-2659-4cb0-8260-55af9fadbe13', description: 'Thing is subclass of Something' },
    { one: UUID.SOMETHING, other: 'dc006cda-047a-4862-acf7-e215355b6890', description: 'Place is subclass of Something' },
    { one: UUID.SOMETHING, other: 'f48ef10a-40f6-4190-bfae-2834e9781ad1', description: 'This is child of Something' },
    // Collection → subclasses
    { one: '6a65dbf3-ad39-4446-8b8b-c0f539c1d53a', other: '4ed8a123-eceb-4c30-a8d6-c5694ce3d2f8', description: 'List is a child of Collection' },
    { one: '6a65dbf3-ad39-4446-8b8b-c0f539c1d53a', other: 'c0e229b8-6e56-45ee-b454-71e557cdb191', description: 'Group is subclass of Collection' },
    // Group → subclasses
    { one: 'c0e229b8-6e56-45ee-b454-71e557cdb191', other: '1fdf78e0-aa61-4e52-bbed-4ce157da78ab', description: 'Спортивная секция is a child of Group' },
    { one: 'c0e229b8-6e56-45ee-b454-71e557cdb191', other: '2067c7bf-0f6f-491d-af2b-10105db4e8cc', description: 'This is child of Group' },
    { one: 'c0e229b8-6e56-45ee-b454-71e557cdb191', other: 'caf05706-c73d-43e9-a496-6069f9aefc99', description: 'Music band is of class Group' },
    // Live Being → subclasses
    { one: '71e49073-503f-4faa-932d-68ab89662420', other: '4c8ee41a-9912-4dff-8b44-7779a66e4fcf', description: 'Human is subclass of Live Being' },
    // Character → subclasses
    { one: 'f48ef10a-40f6-4190-bfae-2834e9781ad1', other: '860dd2fe-b70f-42b2-a446-20528245eeff', description: 'This is child of Character' },
    { one: 'f48ef10a-40f6-4190-bfae-2834e9781ad1', other: 'aea400ce-a2e4-4d56-a3ba-3ab1bdd30e7a', description: 'This is child of Character' },
    // Thing → subclasses
    { one: 'baeb5e5f-2659-4cb0-8260-55af9fadbe13', other: '69087526-c024-43a8-81bc-c067487e11bb', description: 'This is child of Thing' },
    { one: 'baeb5e5f-2659-4cb0-8260-55af9fadbe13', other: 'c38cad91-7747-4bbc-abd3-09b50e6e4672', description: 'This is child of Thing' },
    // Piece of art or work → subclasses
    { one: '69087526-c024-43a8-81bc-c067487e11bb', other: '4fdcbd06-3233-4dcc-8259-fd6150cce007', description: 'Music is a child of Piece of art or work' },
    { one: '69087526-c024-43a8-81bc-c067487e11bb', other: 'fb8d457c-62b4-43e9-9e4d-014201176f01', description: 'This is child of Piece of art or work' },
    // Product → subclasses
    { one: 'c38cad91-7747-4bbc-abd3-09b50e6e4672', other: '11544624-be5c-4cdc-8fe1-701c09391464', description: 'This is child of Product' },
    { one: 'c38cad91-7747-4bbc-abd3-09b50e6e4672', other: '52e2b5ce-562b-46eb-98b7-48703ed62a7e', description: 'This is child of Product' },
    { one: 'c38cad91-7747-4bbc-abd3-09b50e6e4672', other: '7bdf2d4a-5329-4603-9562-b5c656d45306', description: 'Vessel is a child of Product' },
    { one: 'c38cad91-7747-4bbc-abd3-09b50e6e4672', other: 'ea7aed7a-8cdf-45e4-9896-43c57ffdf132', description: 'Computing Device is a child of Product' },
    // Vessel → subclasses
    { one: '7bdf2d4a-5329-4603-9562-b5c656d45306', other: 'd6320bf5-ca8b-4e50-ad5c-873216d9fcf0', description: 'Yacht is a child of Vessel' },
    // Music equipment → subclasses
    { one: '52e2b5ce-562b-46eb-98b7-48703ed62a7e', other: '934efd3c-9781-4f2a-bd51-716a75cf5874', description: 'This is child of Music Equipment' },
    // Music Instrument → subclasses
    { one: '934efd3c-9781-4f2a-bd51-716a75cf5874', other: '90d97b01-ee65-4be5-ae27-fb9bec2aeedf', description: 'This is child of Music Instrument' },
    // Place → subclasses
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: '14cd9c8b-84a4-4fd2-82a8-97477ff2d5ee', description: 'This is child of Place' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: '20f6b1ae-86de-4221-bf0c-995be2687405', description: 'This is child of Place' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: '2922e0c4-e82b-45e3-b85a-17619d75c37f', description: 'Object is of class' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: '3c7d2abc-3f31-4c73-bbbd-3e7b2e620630', description: 'This is child of Place' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: '4ec0a490-9a24-491c-b0d7-c994d58fc468', description: 'This is child of Place' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: '5787ef00-3f6b-46fe-9e93-d32c9ebdeab4', description: 'This is child of Place' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: '602f1b6b-1383-442b-908c-1a027d7a8010', description: 'Restaurant, club, bar is subclass of Place' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: '6170d4e4-aab7-443b-baa1-f77dabc0e201', description: 'Functional place is a child of Place' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: '73482bbe-d377-4e01-9efb-de135916c94a', description: 'This is child of Place' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: '8617d9c3-94fb-4f75-a983-1d8ba0822b0d', description: 'This is child of Place' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: 'a31e2319-d8e0-4e48-98c8-3f23d0a17d50', description: 'This is child of Place' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: 'ad4be260-0af0-4e7c-928e-a7177158e1d0', description: 'This is child of Place' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: 'd0eefbac-ce31-4bf1-b392-61e3a6d17ae5', description: 'This is child of Place' },
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: 'f989e699-dc6f-45f8-a985-145d28f68ffd', description: 'This is child of Place' },
    // Flat → subclass of Place
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: 'dbb3866e-e5a8-4186-b6e3-a273a42b1809', description: 'Flat is subclass of Place' },
    // Water area → subclasses
    { one: 'f989e699-dc6f-45f8-a985-145d28f68ffd', other: '62e7ab56-4ebe-4002-a7f1-896e266b8078', description: 'This is child of Water area' },
    { one: 'f989e699-dc6f-45f8-a985-145d28f68ffd', other: '7d548ec2-69e9-4329-b122-acb83cd83325', description: 'This is child of Water area' },
    // System → subclasses
    { one: UUID.SYSTEM, other: UUID.USER,                       description: 'User is subclass of System' },
    { one: UUID.SYSTEM, other: 'c532f6ba-27b2-43ec-b4ec-30cbff78eed0', description: 'Access group is subclass of System' },
    { one: UUID.SYSTEM, other: UUID.GROUP_READ_ACCESS,          description: 'Group read access is subclass of System' },
    { one: UUID.SYSTEM, other: UUID.BELONGS_TO_USER_GROUP,      description: 'Belongs to user group is subclass of System' },
    { one: UUID.SYSTEM, other: UUID.G_SERVER_CLASS,              description: 'Server is subclass of System' },
    { one: UUID.SYSTEM, other: '298496fb-142b-4fc7-a844-7cb3fe9f9100', description: 'System event is subclass of System' },
    // Event → GEDCOM event subclasses
    // (Residence already exists under Event with id a70ae070 from the dev1
    // taxonomy cleanup — reused by the GEDCOM importer via RESIDENCE_CLASS.)
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: UUID.BIRTH_CLASS,       description: 'Birth is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: UUID.DEATH_CLASS,       description: 'Death is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: UUID.OCCUPATION_CLASS,  description: 'Occupation is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: UUID.MARRIAGE_CLASS,    description: 'Marriage is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: UUID.BURIAL_CLASS,      description: 'Burial is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: UUID.EDUCATION_CLASS,   description: 'Education is subclass of Event' },
    { one: '0eed3b56-bdd6-47f0-9413-d9640a9dcafc', other: UUID.CHRISTENING_CLASS, description: 'Christening is subclass of Event' },
    // Place → Address
    { one: 'dc006cda-047a-4862-acf7-e215355b6890', other: UUID.ADDRESS_CLASS,     description: 'Address is subclass of Place' },
    // System → GEDCOM (external data source class)
    { one: UUID.SYSTEM, other: UUID.GEDCOM_CLASS, description: 'GEDCOM is subclass of System' },
];
