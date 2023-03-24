<?php
/**
 * factology
 * User: fokin
 * Created: 10/03/2020
 */

namespace Tests\Unit;


use App\Models\Classes\Anything;
use Tests\TestCase;

require_once(__DIR__ . '/../../filescanner/FileScanner.php');

class FileScannerTest extends TestCase
{
    public function fileToDateDataProvider()
    {
        return [
            ['IMG_20200223_190915.jpg', '2020-02-23 19:09:15'],
            ['20191028175227_MVI_5577.MP4', '2019-10-28 17:52:27'],
            ['nShot_20190713_100120232.mp4', '2019-07-13 10:01:20'],
            ['VID-20190817-WA0009.mp4', '2019-08-17 00:00:00'],
            ['20010101121212.jpg', '2001-01-01 12:12:12'],
        ];
    }

    /**
     * @param $name
     * @param $dateExpected
     * @dataProvider fileToDateDataProvider
     */
    public function testFileToDate($name, $dateExpected)
    {
        $date = \FileScanner::getDateFromFileName($name);
        self::assertEquals($dateExpected, $date->format(Anything::TIME_FORMAT));
    }

    public function getDateFromFileDataProvider()
    {
        return [
            ['VID_20200220_230730.mp4', '20200220230730'],
            ['20010101121212.jpg', '20010101121212'],
            ['2020-03-10 14-13-08.JPG', '20200310141308'],
        ];
    }

    /**
     * @param $fileName
     * @dataProvider getDateFromFileDataProvider
     */
    public function testGetDateFromFile($fileName, $expected): void
    {
        $file = sys_get_temp_dir() . DIRECTORY_SEPARATOR . $fileName;
        try {
            touch($file);
            [$date, $source] = \FileScanner::getDateFromFileOrFolderName($file);
            self::assertEquals('name', $source);
            self::assertEquals($expected, $date->format('YmdHis'));

        } finally {
            @unlink($file);
        }
    }
}