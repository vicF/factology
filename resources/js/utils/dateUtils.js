function dateFromDb(number, timeZone = 'UTC', format = 'yyyy-MM-dd HH:mm:ss') {
    if (number === null) {
        return null;
    }

    let bc = number[0] === '-';
    if (bc) {
        number = number.substring(1);
    }

    number = number.padStart(14, '0');
    if (bc) {
        // Note: Implement _correctBeforeBC if needed, similar logic as in PHP
        number = _correctBeforeBC(number);
    }

    const milleniums = parseInt(number.substring(0, number.length - 13), 10);
    const smallNumber = '1' + number.substring(number.length - 13);
    const d = DateTime.fromFormat(smallNumber, 'yyyyMMddHHmmss', { zone: 'UTC' });

    if (d.isValid) {
        try {
            d.setZone(timeZone);
            // Custom format can be applied here
            return (bc ? '-' : '') + milleniums + d.toFormat(format).substring(1);
        } catch (e) {
            throw new Error(`Failed to transform value ${number} (${smallNumber}) to date: ${e.message}`);
        }
    } else {
        throw new Error(`Invalid date format: ${number}`);
    }
}

// In this example, I'm using Luxon for date manipulation (https://moment.github.io/luxon/),
// as JavaScript's built-in Date object is not as versatile as PHP's DateTime.
// You need to install Luxon: npm install luxon
import { DateTime } from 'luxon';

export { dateFromDb };

