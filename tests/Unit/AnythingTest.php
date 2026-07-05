<?php
/**
 * factology
 * User: fokin
 * Created: 11/01/2021
 */

namespace Tests\Unit;


use App\Models\Classes\Everything;
use Tests\TestCase;

class AnythingTest extends TestCase
{
    public function testStartEnd()
    {
        $testDate = (new \DateTime())->format(Everything::TIME_FORMAT);
        $testDateDb = Everything::dateToDb($testDate);
        $obj = new Everything();
        $obj->start_date = $testDate;
        $obj->end_date = $testDate;
        self::assertEquals($testDateDb, $obj->start);
        self::assertEquals($testDateDb, $obj->end);
        $obj = new Everything();
        $obj->start = $testDateDb;
        $obj->end = $testDateDb;
        self::assertEquals($testDate, $obj->start_date);
        self::assertEquals($testDate, $obj->end_date);
        $obj = new Everything([
            'name'  => 'test',
            'start' => $testDateDb,
            'end'   => $testDateDb,
        ]);
        self::assertEquals($testDate, $obj->start_date);
        self::assertEquals($testDate, $obj->end_date);
        $obj = new Everything([
            'name'       => 'test',
            'start_date' => $testDate,
            'end_date'   => $testDate,
        ]);
        self::assertEquals($testDateDb, $obj->start);
        self::assertEquals($testDateDb, $obj->end);
    }

    public function testSetDataDates()
    {
        $testDate = (new \DateTime())->format(Everything::TIME_FORMAT);
        $testDateDb = Everything::dateToDb($testDate);
        $obj = new Everything();
        $obj->setData([
            'name'  => 'test',
            'start' => $testDateDb,
            'end'   => $testDateDb,
        ]);
        self::assertEquals($testDate, $obj->start_date);
        self::assertEquals($testDate, $obj->end_date);
        self::assertEquals($testDateDb, $obj->start);
        self::assertEquals($testDateDb, $obj->end);
        $data = $obj->getData();
        self::assertEquals($testDate, $data['start_date']);
        self::assertEquals($testDate, $data['end_date']);
        self::assertEquals($testDateDb, $data['start']);
        self::assertEquals($testDateDb, $data['end']);
        $obj = new Everything();
        $obj->setData([
            'name'       => 'test',
            'start_date' => $testDate,
            'end_date'   => $testDate,
        ]);
        self::assertEquals($testDate, $obj->start_date);
        self::assertEquals($testDate, $obj->end_date);
        self::assertEquals($testDateDb, $obj->start);
        self::assertEquals($testDateDb, $obj->end);
        $data = $obj->getData();
        self::assertEquals($testDate, $data['start_date']);
        self::assertEquals($testDate, $data['end_date']);
        self::assertEquals($testDateDb, $data['start']);
        self::assertEquals($testDateDb, $data['end']);

        $obj = Everything::CreateFromData([
            'name'  => 'test',
            'start' => $testDateDb,
            'end'   => $testDateDb,
        ]);
        self::assertEquals($testDate, $obj->start_date);
        self::assertEquals($testDate, $obj->end_date);
        self::assertEquals($testDateDb, $obj->start);
        self::assertEquals($testDateDb, $obj->end);

        $obj = Everything::CreateFromData([
            'name'       => 'test',
            'start_date' => $testDate,
            'end_date'   => $testDate,
        ]);
        self::assertEquals($testDate, $obj->start_date);
        self::assertEquals($testDate, $obj->end_date);
        self::assertEquals($testDateDb, $obj->start);
        self::assertEquals($testDateDb, $obj->end);
    }
}
