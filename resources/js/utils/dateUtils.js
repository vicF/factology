// resources/js/utils/dateUtils.js

const TIME_FORMAT = 'Y-m-d H:i:s'
const DATABASE_TIME_FORMAT = 'YmdHis'

export function dateFromDb(input, timeZone = null, format = null) {
    console.log('Date from DB:', input)

    if (format === null) {
        format = TIME_FORMAT
    }
    if (input === null || input === undefined || input === '') {
        return null
    }

    let number = String(input)
    let bc = number.startsWith('-')

    if (bc) {
        number = number.slice(1)
    }

    // Handle special case: short inputs like '1970', '197001' should default to Jan 1
    if (number.length < 8) {
        // Pad year to 4 digits
        let yearStr = number.padStart(4, '0').slice(0, 4)
        // Default to January 1st, 00:00:00
        number = yearStr + '0101000000'
    }

    // Pad with zeros to reach at least 14 characters (YYYYMMDDHHMMSS)
    if (number.length < 14) {
        number = number.padEnd(14, '0')
    }

    // Extract components
    let yearStr = number.slice(0, -10)
    let rest = number.slice(-10)
    let month = rest.slice(0, 2)
    let day = rest.slice(2, 4)
    let hour = rest.slice(4, 6)
    let minute = rest.slice(6, 8)
    let second = rest.slice(8, 10)

    // Ensure month and day have default values if they're "00"
    if (month === '00') month = '01'
    if (day === '00') day = '01'

    // For extremely large years (> 12 digits), preserve exact format
    if (yearStr.length > 12 || (yearStr.length === 13 && yearStr.startsWith('999'))) {
        let result = `${yearStr}-${month}-${day} ${hour}:${minute}:${second}`
        if (bc) {
            result = '-' + result
        }
        return result
    }

    // Parse date components
    let year = parseInt(yearStr)
    let monthNum = parseInt(month) - 1
    let dayNum = parseInt(day)
    let hourNum = parseInt(hour)
    let minuteNum = parseInt(minute)
    let secondNum = parseInt(second)

    // Validate month (0-11) and day (1-31)
    if (monthNum < 0) monthNum = 0
    if (monthNum > 11) monthNum = 11
    if (dayNum < 1) dayNum = 1
    if (dayNum > 31) dayNum = 31
    if (hourNum > 23) hourNum = 23
    if (minuteNum > 59) minuteNum = 59
    if (secondNum > 59) secondNum = 59

    // Create date in UTC
    let date = new Date(Date.UTC(year, monthNum, dayNum, hourNum, minuteNum, secondNum))

    // Handle 24:00:00 - should be 00:00:00 of next day
    if (hourNum === 24) {
        date = new Date(Date.UTC(year, monthNum, dayNum))
        date.setUTCDate(date.getUTCDate() + 1)
        hourNum = 0
        minuteNum = 0
        secondNum = 0
        date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0))
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
        // Return formatted string as fallback
        let result = `${yearStr}-${month}-${day} ${hour}:${minute}:${second}`
        if (bc) {
            result = '-' + result
        }
        return result
    }

    // Apply timezone if specified and not UTC
    if (timeZone && timeZone !== 'UTC' && timeZone !== null) {
        // Format in the specified timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        })
        const parts = formatter.formatToParts(date)
        const yearPart = parts.find(p => p.type === 'year')?.value
        const monthPart = parts.find(p => p.type === 'month')?.value
        const dayPart = parts.find(p => p.type === 'day')?.value
        const hourPart = parts.find(p => p.type === 'hour')?.value
        const minutePart = parts.find(p => p.type === 'minute')?.value
        const secondPart = parts.find(p => p.type === 'second')?.value
        return `${yearPart}-${monthPart}-${dayPart} ${hourPart}:${minutePart}:${secondPart}`
    }

    // Format as UTC
    const pad = (n) => String(n).padStart(2, '0')
    const finalYear = date.getUTCFullYear()
    const finalMonth = date.getUTCMonth() + 1
    const finalDay = date.getUTCDate()
    const finalHour = date.getUTCHours()
    const finalMinute = date.getUTCMinutes()
    const finalSecond = date.getUTCSeconds()

    let result = `${finalYear}-${pad(finalMonth)}-${pad(finalDay)} ${pad(finalHour)}:${pad(finalMinute)}:${pad(finalSecond)}`

    if (bc && finalYear < 0) {
        result = '-' + result
    }

    return result
}
