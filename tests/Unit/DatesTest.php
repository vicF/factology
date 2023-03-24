<?php
/**
 * factology
 * User: fokin
 * Created: 04/03/2020
 */

namespace Tests\Unit;


use Carbon\Carbon;
use App\Models\Classes\Anything;
use ReflectionMethod;
use Tests\TestCase;

class DatesTest extends TestCase
{
    public function dataProvider()
    {
        $msk = Carbon::now('Europe/Moscow')->offsetHours;
        $now = new \DateTime();
        $nowUtc = clone $now;
        $nowUtc->setTimezone(new \DateTimeZone('UTC'));
        return [
            ['1970-01-01 00:00:00', '19700101000000', 'UTC'],
            ['1970-01-01 00:00', '19700101000000', 'UTC'], // @TODO accept shorter dates
            ['1970-01-01', '19700101000000', 'UTC'],
            ['1970-01', '19700101000000', 'UTC'],
            ['1970', '19700101000000', 'UTC'],
            ['1970-01-01 00:00:01', '19700101000001', 'UTC'],
            ['2018-09-23 13:44:21.000000', '20180923134421', 'UTC'],
            ['2018-09-23 13:44:21.877890', '20180923134421', 'UTC'],
            ['2018-09-23 13:44', '20180923134400', 'UTC'],
            ['2018-09-23', '20180923000000', 'UTC'],
            ['1970-01-01 0' . $msk . ':00:00', 19700101000000 , 'Europe/Moscow'],
            [$now->format(Anything::TIME_FORMAT), $nowUtc->format(Anything::DATABASE_TIME_FORMAT), 'UTC'],
            [$now->format(Anything::TIME_FORMAT), $now->format(Anything::DATABASE_TIME_FORMAT), date_default_timezone_get()],
            ['9999999999-01-01 00:00:00', '99999999990101000000', 'UTC'],
            ['-9999999999-01-01 00:00:00', '-99999999990101235959', 'UTC'], // Hours, minutes, seconds are inverted for BC dates
            ['-9999999999', '-99999999990101235959', 'UTC'],
            ['999999999999999-01-01 00:00:00', '9999999999999990101000000', 'UTC'],
            ['999999999999999-01-01 00:00', '9999999999999990101000000', 'UTC'],
            ['999999999999999-01-01', '9999999999999990101000000', 'UTC'],
            ['999999999999999-01', '9999999999999990101000000', 'UTC'],
            ['999999999999999', '9999999999999990101000000', 'UTC'],
        ];
    }

    /**
     * @param $date
     * @param $number
     * @param $timeZone
     * @dataProvider dataProvider
     */
    public function testDates($date, $number, $timeZone)
    {
        self::assertEquals(Anything::dateToDb($date, $timeZone), $number);
        if (($p = strpos($date, '.')) !== false) {
            $date = substr($date, 0, $p);  // Remove dot and milliseconds if present
        }
        $dateFromDb = Anything::dateFromDb($number, $timeZone);
        self::assertEquals(Anything::padDate($date), $dateFromDb);
    }


    public function dateToNumberDataProvider()
    {
        return [
            ['1970-01-01 00:00:00'],
            ['1972-05-31 02:01:00'],
            ['1969-01-01 00:00:00'],
            ['2020-03-08 23:59:59'],
            ['1000-01-01 00:00:00'],
            ['0999-01-01 00:00:00'],
            ['8498-01-05 12:00:00'],
            ['0000-01-05 12:00:00'],
            ['-0001-01-01 00:00:00'],
            ['-130000000-10-02 23:59:59'],
            ['130000000-10-02 23:59:59'],
            ['999999999-10-02 23:59:59'],
        ];
    }

    /**
     * @dataProvider dateToNumberDataProvider
     * @param $date
     */
    public function testDatesToNumber($date): void
    {
        $this->assertEquals($date, Anything::dateFromDb(Anything::dateToDb($date)));
    }

    /**
     * @dataProvider dateToNumberDataProvider
     * @param $date
     */
    public function testDatesToNumberWithTimezone($date): void
    {

        $this->assertEquals($date, Anything::dateFromDb(Anything::dateToDb($date, 'UTC'), 'UTC'));
    }

    public function testTimezone(): void
    {
        $date = '2020-01-01 03:01';
        $dateUtc = Anything::dateToDb($date, 'UTC');
        $dateSpb = Anything::dateToDb($date, 'Europe/Moscow');
        $this->assertEquals(30000, $dateUtc - $dateSpb);
    }

    public function compareDatesDataProvider()
    {
        return [
            // Left date is earlier than right
            ['1970-01-01 00:00:00', '1970-01-01 00:00:01'],
            ['1969-01-01 00:00:00', '1969-01-01 00:00:01'],
            ['0001-01-01 00:00:00', '0001-01-01 00:00:01'],
            ['-0001-01-01 00:00:00', '-0001-01-01 00:00:01'],   // While negative year is less, time of day is always positive and counts up
            ['-0001-01-01 00:00:00', '2020-01-01 00:00:01'],
            ['-13000000000-01-01 00:00:00', '-0001-01-01 00:00:01'],
            ['-999999999-10-02 23:59:59', '999999999-10-02 23:59:59'],
            ['-13000000000-01-01 00:01:00', '-13000000000-01-01 00:02:00'],
            ['999999999-10-02 23:59:58', '999999999-10-02 23:59:59'],
        ];
    }

    /**
     * @dataProvider compareDatesDataProvider
     * @param $less
     * @param $more
     */
    public function testCompareDates($less, $more)
    {
        $lessDb = Anything::dateToDb($less);
        $moreDb = Anything::dateToDb($more);
        $this->assertEquals(1, bccomp($moreDb, $lessDb),
            "Failed to assert that $lessDb as representation of date $less is less than $moreDb as representation of date $more");
    }

    public function fourDigitsDataProvider()
    {
        return [
            // Left date is earlier than right
            ['1970-01-01 00:00:00', false],
            ['1969-01-01 00:00:00', false],
            ['0001-01-01 00:00:00', false],
            ['-0001-01-01 00:00:00', false],
            ['-0001-01-01 00:00:00', false],
            ['-13000000000-01-01 00:00:00', true],
            ['-999999999-10-02 23:59:59', true],
            ['-13000000000-01-01 00:01:00', true],
            ['999999999-10-02 23:59:58', true],
        ];
    }

    /**
     * @dataProvider fourDigitsDataProvider
     * @param $date
     * @param $result
     */
    public function testYearHas4Digits($date, $result)
    {
        self::assertEquals($result, Anything::yearHasMoreThan4Digits($date));
    }

    public function padDateDataProvider()
    {
        return [
            ['9999', '9999-01-01 00:00:00'],
            ['9999-01-01 00:00:00', '9999-01-01 00:00:00'],
            ['9999-01-01 00:00', '9999-01-01 00:00:00'],
            ['9999-01-01 ', '9999-01-01 00:00:00'],
            ['9999-01', '9999-01-01 00:00:00'],
            ['-989999-01-01', '-989999-01-01 00:00:00'],
            ['-9', '-9-01-01 00:00:00'],
            ['1', '1-01-01 00:00:00'],
        ];
    }

    /**
     * @param $date
     * @param $expected
     * @dataProvider padDateDataProvider
     */
    public function testPadDate($date, $expected)
    {
        self::assertEquals($expected, Anything::padDate($date));
    }

    public function correctBeforeBCDataProvider()
    {
        return [
            ['-00010101000000', '-00010101235959'],
            ['-00010101235959', '-00010101000000'],
        ];
    }

    /**
     * @param $input
     * @param $expected
     * @dataProvider correctBeforeBCDataProvider
     */
    public function testCorrectBeforeBC($input, $expected)
    {
        $CorrectBeforeBCMethod = new ReflectionMethod(Anything::class, '_correctBeforeBC');
        $CorrectBeforeBCMethod->setAccessible(true);
        self::assertEquals($expected, $CorrectBeforeBCMethod->invoke(null, $input));
    }
}