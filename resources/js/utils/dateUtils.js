function _correctBeforeBC(number) {
    return number;
}

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
        number = _correctBeforeBC(number);
    }

    const milleniums = parseInt(number.substring(0, number.length - 13), 10);
    const smallNumber = '1' + number.substring(number.length - 13);
    const d = DateTime.fromFormat(smallNumber, 'yyyyMMddHHmmss', { zone: 'UTC' });

    if (d.isValid) {
        try {
            d.setZone(timeZone);
            return (bc ? '-' : '') + milleniums + d.toFormat(format).substring(1);
        } catch (e) {
            throw new Error(`Failed to transform value ${number} (${smallNumber}) to date: ${e.message}`);
        }
    } else {
        throw new Error(`Invalid date format: ${number}`);
    }
}

import { DateTime } from 'luxon';
export { dateFromDb };
