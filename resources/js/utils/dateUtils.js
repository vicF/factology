/**
 * Replicates the PHP Anything::dateFromDb() behaviour.
 *
 * PHP logic:
 *   1. Try direct DateTime::createFromFormat(DATABASE_TIME_FORMAT, $number, UTC)
 *   2. If that fails:
 *        • Detect BC (leading '-')
 *        • Pad to 14 digits
 *        • Apply _correctBeforeBC() for BC dates
 *        • Split into milleniums + 13‑digit part
 *        • Parse 1 + 13‑digit part as UTC
 *        • Re‑attach milleniums (with sign) and drop the leading “1” from the formatted string
 *   3. Finally set the requested timezone and format.
 *
 * The constants below match the PHP class:
 *   DATABASE_TIME_FORMAT = 'yyyyMMddHHmmss'
 *   TIME_FORMAT          = 'yyyy-MM-dd HH:mm:ss'
 */
const DATABASE_TIME_FORMAT = 'yyyyMMddHHmmss';
const TIME_FORMAT          = 'yyyy-MM-dd HH:mm:ss';

/**
 * BC‑date sorting correction – exactly the same algorithm as PHP.
 *
 * PHP inverts the last 6 digits (HHmmss) for BC dates.
 */
function _correctBeforeBC(number) {
    // number is a 14‑digit string without the leading '-'
    const last13 = number.substring(number.length - 13);
    const HH = parseInt(last13.substring(7,9), 10);
    const mm = parseInt(last13.substring(9,11), 10);
    const ss = parseInt(last13.substring(11,13), 10);
    const invertedHH = (23 - HH).toString().padStart(2, '0');
    const invertedmm = (59 - mm).toString().padStart(2, '0');
    const invertedss = (59 - ss).toString().padStart(2, '0');
    return number.substring(0, number.length - 13) + last13.substring(0,7) + invertedHH + invertedmm + invertedss;
}

/**
 * Main conversion function – 1:1 with PHP Anything::dateFromDb().
 */
function dateFromDb(number, timeZone = 'UTC', format = TIME_FORMAT) {
    if (number === null) {
        return null;
    }

    const input = String(number);

    // -----------------------------------------------------------------
    // 1. Try direct parsing (covers normal dates, timestamps, etc.)
    // -----------------------------------------------------------------
    let d = DateTime.fromFormat(input, DATABASE_TIME_FORMAT, { zone: 'UTC' });
    if (d.isValid) {
        d = d.setZone(timeZone);
        return d.toFormat(format);
    }

    // -----------------------------------------------------------------
    // 2. Fallback – pad / BC handling
    // -----------------------------------------------------------------
    let bc = input[0] === '-';
    let work = bc ? input.substring(1) : input;

    // Remove any non‑digit characters (microseconds, dots, etc.) – PHP ignores them
    work = work.replace(/[^\d]/g, '');

    const length = work.length;

    if (length < 4) {
        throw new Error(`Invalid date format: ${input}`);
    }

    // Pad on the right with defaults for short inputs (@TODO in PHP)
    let pad = '';
    switch (14 - length) {
        case 10: pad = '0101000000'; break; // add MM dd HH mm ss
        case 8: pad = '01000000'; break; // add dd HH mm ss
        case 6: pad = '000000'; break; // add HH mm ss
        case 4: pad = '0000'; break; // add mm ss
        case 2: pad = '00'; break; // add ss
        case 0: break;
        default: if (length > 14) break; else throw new Error(`Invalid date format: ${input}`);
    }
    work += pad;

    if (bc) {
        work = _correctBeforeBC(work);
    }

    // Milleniums are the prefix (as string for large numbers)
    const milleniums = work.substring(0, work.length - 13) || '0';
    const smallNumber = '1' + work.substring(work.length - 13);

    d = DateTime.fromFormat(smallNumber, DATABASE_TIME_FORMAT, { zone: 'UTC' });

    if (!d.isValid) {
        throw new Error(`Invalid date format: ${input}`);
    }

    d = d.setZone(timeZone);
    const formatted = d.toFormat(TIME_FORMAT);           // always format with TIME_FORMAT first
    const result = (bc ? '-' : '') + milleniums + formatted.substring(1);

    // If a custom format is requested, re‑format the *already‑correct* DateTime
    if (format !== TIME_FORMAT) {
        const intermediate = DateTime.fromFormat(
            result,
            bc ? `-yyyy-MM-dd HH:mm:ss` : TIME_FORMAT,
            { zone: timeZone }
        );
        return intermediate.toFormat(format);
    }

    return result;
}

// ---------------------------------------------------------------------
// Luxon import (must stay at the bottom – ESM style)
// ---------------------------------------------------------------------
import { DateTime } from 'luxon';

export { dateFromDb };
