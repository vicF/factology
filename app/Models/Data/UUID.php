<?php
/**
 * facts1
 * User: fokin
 * Created: 07/10/2019
 */

namespace Fokin\Facts\Data;


class UUID
{
    public const CLIENT_TIMEZONE = 'Europe/Moscow'; // @TODO this is temporary. Should be stored in user preferences

    public const GENERAL = 1;
    public const G_LINK = 4;
    public const G_THING = 3;
    public const G_CLASS = 2;
    public const G_EXTERNAL = 5;

    public const ANYTHING = '939cd822-9e23-450c-8c5e-c23f67cca792';
    public const LINK = '4b27fd0c-d8be-425c-a529-2186b2589e76';
    public const SOMETHING = '3e15244c-a9e1-4a91-a0ca-1c65722a64df';
    public const LINK_TO_CLASS = 'c217c185-742f-4a9f-8e69-acea2b4f5aea';
    public const LINK_TO_PARENT = '361c19af-c011-4051-9329-49c75d1ca0fb';
    public const USER ='664e746e-8f37-4f80-ba78-734424eab2a6';
    public const SYSTEM ='c0b920d7-8b14-43a4-a28a-16115d0bee9e';
    public const FILE_TYPE = '46cfb494-5dc1-436c-82e0-e7d6ec55b85b';
    public const TYPE = '12011201-d51d-4fe9-b4a1-a829e9dac8bf';
    public const LINK_TO_STORAGE = '1dcb897e-0f64-499f-b80d-2cac4a025ed4';
    public const LINK_TO_SOURCE = 'd92fd5cd-ca65-41cb-879e-e87c0450fecd';
    public const _CLASS = '2a17aede-1e55-45b6-983b-f69b4937cafc';
    public const ORIGINAL_FILE = 'd0ef8bb1-79c2-46ce-bbb4-83bffdad80e2';
    public const DIGITAL_DATA = '36468923-72a2-4d5d-a825-a54cd2ffac55';
    public const FILE = '5a626fa7-b69f-4042-9556-374f10df0a2c';
    public const JPG = '202862e8-f529-4795-9742-1e9b07b185a4';
    public const GIF = 'f97bd121-00fc-4534-89be-9c262f297dd8';
    public const PNG = '6e98c5ca-8ec4-44af-9c5d-b71d10fac325';
    public const BMP = '0d3dab07-9bdb-4c49-acc5-b30742846866';
    public const MPEG = 'cf2d0161-c11a-4d20-b99a-abf9f596f97a';
    public const AVI = '3711836a-de12-4444-8bb1-553323362322';
    public const FORMAT_3GP = '8d6ad14c-c2e1-424f-af4e-2bfd3e27beb2';
    public const MOV = '348e8ff4-8ec6-4f3e-8e76-54e6a43b853e';
    public const FILE_STORAGE = 'cf8fc1a2-fcec-4bab-a3e2-07edde6e1868';
    public const MAC_MINI = 'f9a2ba25-2965-4f11-8cb8-e580a7660c5b';
    public const FLICKR_F0KIN = 'fdd38e7f-f995-434f-a8fe-6f473b500c6d';
    public const YANDEX_VICF = '33c0adad-bb22-4431-aff9-e5cba72af7ea';
    public const PHOTO = '4b22a805-f3e1-47b9-bb87-b7a9f6f68cc4';
    public const VIDEO = 'da17d697-d877-4625-8bcd-944570a21796';
    public const AUDIO = '03d72750-32b4-4c52-8a59-37fbb93b3082';
    public const INSIDE = '922cca80-a0ba-4a5e-8344-769f083f0e72';
    public const VICTOR_FOKIN = '0ac1b13b-acbf-4246-bed4-8f0c2a8b2546';
    public const EVIDENCE = '4eff773a-6bbd-410f-a668-681b41d69051';
    public const HUMAN = '4c8ee41a-9912-4dff-8b44-7779a66e4fcf';
    public const TRIP = 'e3cad1b0-74fa-44b2-9b2f-2adaf36baa14';
    public const FATHER = '29cafd84-0fc9-4295-afcc-d73b9613e39f';
    public const MOTHER = 'b7c887b7-cee4-452d-b491-bd552de79d70';
    public const PRESENT = '8811c270-4285-4534-bb2a-c4da1ba850e4';
    public const PRESENT_AS_ACTOR = '1e53a04c-15cf-49ba-9495-59d1d67500b6';
    public const EVENT = '0eed3b56-bdd6-47f0-9413-d9640a9dcafc';
    public const PERFORMANCE = '770b8c20-fb65-4896-9de6-21cecc03a332';
    public const MEETING = 'ac598f55-78b4-41c9-aaa6-32fa6a93d939';
    public const PHOTO_SESSION = '4cc9a0fd-1ac2-4bc2-9f10-4fac1f90f376';
    public const CHECK_IN = '960e0074-5945-4163-a9ba-576a09ced6da';
    public const MUSIC_BAND = 'caf05706-c73d-43e9-a496-6069f9aefc99';
    public const MEMBER_OF = '6c4c2f74-aa7f-4c17-bdbc-87a55fe253cf';
    public const GROUP_READ_ACCESS = 'ea206516-9e45-482f-89be-05313f52e5e3';
    public const BELONGS_TO_USER_GROUP = 'e18d73eb-a5d3-47be-a785-106f6f185651';

    public static function contains(array $data,
                                    array $otherThings,
                                    $linkType = self::LINK_TO_CLASS,
                                    $otherThingIdName = 'other_thing_id',
                                    $linkTypeName = 'link_type_id')
    {
        foreach ($data as $node) {
            foreach ($otherThings as $otherThing) {
                if ($node->$linkTypeName === $linkType && $node->$otherThingIdName === $otherThing) {
                    return true;
                }
            }
        }
        return false;
    }

    public static function isPhoto(array $data)
    {
        return self::contains($data, [self::PHOTO]);
    }

    public static function isMedia(array $data)
    {
        return self::contains($data, [self::PHOTO, self::VIDEO, self::AUDIO]);
    }
}
