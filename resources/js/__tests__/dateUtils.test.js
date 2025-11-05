/**
 * Jest test suite for resources/js/utils/dateUtils.js
 *
 * The function dateFromDb(number, timeZone = 'UTC', format = 'yyyy-MM-dd HH:mm:ss')
 * converts a DB-style string (e.g. "20231015123045" or "-12345678901234")
 * into a formatted date string using Luxon.
 *
 * The data provider below contains:
 *   [inputNumber, timeZone, format, expectedResult]
 *
 * If the function throws, the expected value is an Error instance.
 */

import { dateFromDb } from '../utils/dateUtils';
import { DateTime } from 'luxon';

// ---------------------------------------------------------------------
//  DATA PROVIDER – mirrors PHP AnythingTest::dataProvider()
// ---------------------------------------------------------------------
const dateProvider = [
    // Normal dates – full timestamp
    ['19700101000000', 'UTC', 'yyyy-MM-dd HH:mm:ss', '1970-01-01 00:00:00'],
    // Short formats (PHP pads automatically)
    ['197001010000', 'UTC', 'yyyy-MM-dd HH:mm:ss', '1970-01-01 00:00:00'],
    ['19700101', 'UTC', 'yyyy-MM-dd HH:mm:ss', '1970-01-01 00:00:00'],
    ['197001', 'UTC', 'yyyy-MM-dd HH:mm:ss', '1970-01-01 00:00:00'],
    ['1970', 'UTC', 'yyyy-MM-dd HH:mm:ss', '1970-01-01 00:00:00'],
    // One second later
    ['19700101000001', 'UTC', 'yyyy-MM-dd HH:mm:ss', '1970-01-01 00:00:01'],
    // Microseconds are ignored (PHP truncates)
    ['20180923134421', 'UTC', 'yyyy-MM-dd HH:mm:ss', '2018-09-23 13:44:21'],
    // Shorter time parts
    ['201809231344', 'UTC', 'yyyy-MM-dd HH:mm:ss', '2018-09-23 13:44:00'],
    ['20180923', 'UTC', 'yyyy-MM-dd HH:mm:ss', '2018-09-23 00:00:00'],

    // Moscow offset (dynamic – we compute it at test runtime)
    (() => {
        const moscowOffset = DateTime.now().setZone('Europe/Moscow').offset / 60; // hours
        const padded = moscowOffset.toString().padStart(2, '0');
        return [`19700101000000`, 'Europe/Moscow', 'yyyy-MM-dd HH:mm:ss', `1970-01-01 ${padded}:00:00`];
    })(),

    // Current time – UTC
    (() => {
        const now = DateTime.utc();
        return [
            now.toFormat('yyyyMMddHHmmss'),
            'UTC',
            'yyyy-MM-dd HH:mm:ss',
            now.toFormat('yyyy-MM-dd HH:mm:ss')
        ];
    })(),

    // Current time – system default timezone
    (() => {
        const now = DateTime.now();
        return [
            now.toFormat('yyyyMMddHHmmss'),
            now.zoneName,
            'yyyy-MM-dd HH:mm:ss',
            now.toFormat('yyyy-MM-dd HH:mm:ss')
        ];
    })(),

    // Huge positive millenniums
    ['99999999990101000000', 'UTC', 'yyyy-MM-dd HH:mm:ss', '9999999999-01-01 00:00:00'],

    // BC dates – hours/minutes/seconds are inverted
    ['-99999999990101235959', 'UTC', 'yyyy-MM-dd HH:mm:ss', '-9999999999-01-01 00:00:00'],
    ['-99999999990101235959', 'UTC', 'yyyy-MM-dd HH:mm:ss', '-9999999999-01-01 00:00:00'], // same as above (short form)

    // Max millenniums (15 digits)
    ['9999999999999990101000000', 'UTC', 'yyyy-MM-dd HH:mm:ss', '999999999999999-01-01 00:00:00'],
    ['99999999999999901010000', 'UTC', 'yyyy-MM-dd HH:mm:ss', '999999999999999-01-01 00:00:00'],
    ['9999999999999990101', 'UTC', 'yyyy-MM-dd HH:mm:ss', '999999999999999-01-01 00:00:00'],
    ['99999999999999901', 'UTC', 'yyyy-MM-dd HH:mm:ss', '999999999999999-01-01 00:00:00'],
    ['999999999999999', 'UTC', 'yyyy-MM-dd HH:mm:ss', '999999999999999-01-01 00:00:00'],

    // Null input
    [null, 'UTC', 'yyyy-MM-dd HH:mm:ss', null],

    // Invalid input (should throw)
    ['invalid', 'UTC', 'yyyy-MM-dd HH:mm:ss', Error('Invalid date format: invalid')],
    ['20231301120000', 'UTC', 'yyyy-MM-dd HH:mm:ss', Error('Invalid date format: 20231301120000')],
];

// ---------------------------------------------------------------------
//  TEST IMPLEMENTATION
// ---------------------------------------------------------------------
describe('dateFromDb', () => {
    test.each(dateProvider)(
        'dateFromDb(%p, %p, %p) → %p',
        (input, timeZone, format, expected) => {
            if (expected instanceof Error) {
                // Expect the function to throw the same error message
                expect(() => dateFromDb(input, timeZone, format)).toThrow(expected);
            } else if (expected === null) {
                expect(dateFromDb(input, timeZone, format)).toBeNull();
            } else {
                expect(dateFromDb(input, timeZone, format)).toBe(expected);
            }
        }
    );
});
