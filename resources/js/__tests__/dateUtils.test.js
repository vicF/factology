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
//  DATA PROVIDER – add more rows whenever you need a new case
// ---------------------------------------------------------------------
const dateProvider = [
    // Normal positive dates
    ['20231015123045', 'UTC', 'yyyy-MM-dd HH:mm:ss', '2023-10-15 12:30:45'],
    ['20231015123045', 'Europe/Paris', 'yyyy-MM-dd HH:mm:ss', '2023-10-15 14:30:45'],
    ['231015123045', 'UTC', 'yyyy-MM-dd HH:mm:ss', '2023-10-15 12:30:45'], // short form, padded automatically
    ['00000000000000', 'UTC', 'yyyy-MM-dd HH:mm:ss', '0001-01-01 00:00:00'], // minimal valid

    // BC dates (negative sign)
    ['-00010101120000', 'UTC', 'yyyy-MM-dd HH:mm:ss', '-0001-01-01 12:00:00'],
    ['-12345678901234', 'UTC', 'yyyy-MM-dd HH:mm:ss', '-1234567-01-01 00:00:00'], // large millenniums

    // Custom format
    ['20231015123045', 'America/New_York', "yyyy LLL dd 'at' HH:mm (ZZZZ)", '2023 Oct 15 at 08:30 (Eastern Daylight Time)'],

    // Edge / error cases
    [null, 'UTC', 'yyyy-MM-dd HH:mm:ss', null],
    ['invalid', 'UTC', 'yyyy-MM-dd HH:mm:ss', Error('Invalid date format: invalid')],
    ['20231301120000', 'UTC', 'yyyy-MM-dd HH:mm:ss', Error('Invalid date format: 20231301120000')], // month 13
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
