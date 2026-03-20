<?php
/**
 * factology
 * User: fokin
 * Created: 26/02/2020
 */

namespace Tests\Unit;

use Tests\TestCase;
use PHPUnit\Framework\Attributes\DataProvider;

//require_once('filescanner/FileScanner.php');

class TakeExifDateTest extends TestCase
{
    public static function dataProvider(): array
    {
        $data = [
            [
                'date'    => '2006-10-22 11:37:23',
                'sources' => [
                    [
                        'FileDateTime'      => 1161517043,
                        'ExifVersion'       => '0220',
                        'DateTimeOriginal'  => '0000-00-00T00:00+04:00',
                        'DateTimeDigitized' => '0000-00-00T00:00+04:00',
                        'DateTime'          => '2006-10-22T15:37:23+04:00',
                    ],
                    [
                        'FileDateTime'      => 1161517043,
                        'ExifVersion'       => '0220',
                        'DateTimeOriginal'  => '0000-00-00T00:00+04:00',
                        'DateTime'          => '0000-00-00T00:00+04:00',
                        'DateTimeDigitized' => '2006-10-22T15:37:23+04:00',
                    ],
                    [
                        'FileDateTime'      => 1161517043,
                        'ExifVersion'       => '0220',
                        'DateTime'          => '0000-00-00T00:00+01:00',
                        'DateTimeDigitized' => '0000-00-00T00:00+04:00',
                        'DateTimeOriginal'  => '2006-10-22T15:37:23+04:00',
                    ],

                ]
            ],
            [
                'date'    => null,
                'sources' => [
                    [
                        'ExifVersion'       => '0220',
                        'DateTime'          => '0000-00-00T00:00+04:00',
                        'DateTimeOriginal'  => '0000-00-00T00:00+04:00',
                        'DateTimeDigitized' => '0000-00-00T00:00+04:00',
                    ],
                    [
                        'ExifVersion' => '0220',
                        'DateTime'    => '0000-00-00T00:00+04:00',
                    ],
                    [
                        'ExifVersion' => '0220',
                    ],
                    [
                        'FileDateTime'      => 1161517043,  // File date time is not used. We need exif dates only or null.
                        'ExifVersion'       => '0220',
                        'DateTimeOriginal'  => '0000-00-00T00:00+04:00',
                        'DateTimeDigitized' => '0000-00-00T00:00+04:00',

                    ],
                    [
                        'FileDateTime' => 1161517043,
                        'ExifVersion'  => '0220',
                        'DateTime'     => '0000-00-00T00:00+04:00',
                    ],
                    [
                        'FileDateTime' => 1161517043,
                        'ExifVersion'  => '0220',
                        'DateTime'     => '0000-00-00T00:00+04:00',
                    ],
                ]
            ]
        ];
        $result = [];
        foreach ($data as $dateItem) {
            foreach ($dateItem['sources'] as $exif) {
                $result[] = [$dateItem['date'], $exif];
            }
        }
        return $result;
    }

    #[DataProvider('dataProvider')]
    public function testGetDateFromExif(?string $expected, array $exif): void
    {
        $this->markTestIncomplete();
        $date = \FileScanner::getDateFromExifUTC($exif, $err);
        if ($expected !== null) {
            $this->assertNotEmpty($date);
            $date->setTimezone(new \DateTimeZone('UTC'));
            $this->assertEquals($expected, $date->format(\FileScanner::TIME_FORMAT), print_r($date, 1));
        } else {
            $this->assertEquals($expected, $date);
        }
    }
}
