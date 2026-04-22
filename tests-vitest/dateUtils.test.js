import { describe, test, expect } from 'vitest';
import { dateFromDb } from '@/utils/dateUtils'; // Using your @ alias from config
import { DateTime } from 'luxon';

/**
 * Vitest adaptation of dateUtils test suite
 */

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

    // Moscow offset (dynamic – computed at test runtime)
    (() => {
        const moscowOffset = DateTime.now().setZone('Europe/Moscow').offset / 60;
        const padded = Math.abs(moscowOffset).toString().padStart(2, '0');
        // Note: Simplified logic for standard offset display
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

    // Huge positive millenniums
    ['99999999990101000000', 'UTC', 'yyyy-MM-dd HH:mm:ss', '9999999999-01-01 00:00:00'],

    // BC dates – hours/minutes/seconds are inverted
    ['-99999999990101235959', 'UTC', 'yyyy-MM-dd HH:mm:ss', '-9999999999-01-01 00:00:00'],

    // Max millenniums (15+ digits)
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
            if (typeof expected === 'string' && expected.startsWith('Invalid date')) {
                // Vitest's toThrow is more consistent when checking specific messages
                expect(() => dateFromDb(input, timeZone, format)).toThrow(expected);
            } else if (expected === null) {
                expect(dateFromDb(input, timeZone, format)).toBeNull();
            } else {
                expect(dateFromDb(input, timeZone, format)).toBe(expected);
            }
        }
    );
});
