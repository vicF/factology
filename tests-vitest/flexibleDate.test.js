// tests-vitest/flexibleDate.test.js
// Mirrors tests/Unit/FlexibleDateTest.php — the fixtures here must stay in
// sync so the PHP and JS implementations prove identical behavior.
import { Era } from '@factology/engine/constants/eras.js'
import { FlexibleDate, QUALIFIER_BETWEEN, QUALIFIER_ALTERNATIVES, PRECISION_YEAR, formatRangeShort, parseFuzz, formatBoundLocalized } from '@factology/engine/utils/flexibleDate.js'
import i18n from '../resources/js/lang/i18n.js'

const t = (key) => i18n.global.t(key)

describe('Era / calendar conversions', () => {
    test.each([
        [2000, 1, 1, 2451545],
        [2023, 9, 16, 2460204],
        [622, 7, 19, 1948440],
        [1582, 10, 15, 2299161],
        [-3760, 9, 7, 347998],
    ])('gregorianToJDN(%i,%i,%i) = %i', (y, m, d, jdn) => {
        expect(Era.gregorianToJDN(y, m, d)).toBe(jdn)
        expect(Era.jdnToGregorian(jdn)).toEqual({ year: y, month: m, day: d })
    })

    test('Julian conversion', () => {
        // Julian 1900-01-01 = Gregorian 1900-01-13
        expect(Era.jdnToGregorian(Era.julianToJDN(1900, 1, 1))).toEqual({ year: 1900, month: 1, day: 13 })
        // The 1582 gap
        expect(Era.jdnToJulian(Era.gregorianToJDN(1582, 10, 15))).toEqual({ year: 1582, month: 10, day: 5 })
    })

    test('World creation conversion', () => {
        expect(Era.toCanonical(Era.WORLD_CREATION, 7533, 1, 1)).toEqual({ year: 2025, month: 1, day: 14, degrade: false })
        expect(Era.toCanonical(Era.WORLD_CREATION, 7533, 9, 1)).toEqual({ year: 2024, month: 9, day: 14, degrade: false })
        expect(Era.fromCanonical(Era.WORLD_CREATION, 2025, 1, 14)).toEqual({ year: 7533, month: 1, day: 1, degrade: false })
    })

    test('Hijri conversion', () => {
        expect(Era.hijriToJDN(1, 1, 1)).toBe(1948440)
        expect(Era.gregorianToJDN(622, 7, 19)).toBe(1948440)
        expect(Era.jdnToHijri(Era.hijriToJDN(1446, 1, 1))).toEqual({ year: 1446, month: 1, day: 1 })
    })

    test('Hebrew conversion', () => {
        expect(Era.hebrewToJDN(5784, 1, 1)).toBe(2460204)
        expect(Era.gregorianToJDN(2023, 9, 16)).toBe(2460204)
        expect(Era.jdnToHebrew(Era.hebrewToJDN(5784, 5, 15))).toEqual({ year: 5784, month: 5, day: 15 })
    })

    test('Era degradation', () => {
        expect(Era.toCanonical(Era.HEBREW, 50000000, 1, 1)).toEqual({ year: 50000000, month: 1, day: 1, degrade: true })
    })
})

describe('FlexibleDate.parse', () => {
    test('digit strings with variable precision', () => {
        expect(FlexibleDate.parse('202608151200').value).toBe('20260815120000')
        expect(FlexibleDate.parse('202608151200').precision).toBe('minute')
        expect(FlexibleDate.parse('2026').precision).toBe(PRECISION_YEAR)
        expect(FlexibleDate.parse('2026').value).toBe('20260101000000')
        expect(FlexibleDate.parse('202608').precision).toBe('month')
        expect(FlexibleDate.parse('20260815').precision).toBe('day')
    })

    test('ISO and Russian formats', () => {
        expect(FlexibleDate.parse('2026-08-15').value).toBe('20260815000000')
        expect(FlexibleDate.parse('15.08.2026').value).toBe('20260815000000')
        expect(FlexibleDate.parse('2026-08').precision).toBe('month')
    })

    test('standard delimiters and space-separated time', () => {
        expect(FlexibleDate.parse('20260816 19:30').value).toBe('20260816193000')
        expect(FlexibleDate.parse('20260816 19:30').precision).toBe('minute')
        expect(FlexibleDate.parse('20260816 19:30:45').value).toBe('20260816193045')
        expect(FlexibleDate.parse('20260816 19:30:45').precision).toBe('second')
        expect(FlexibleDate.parse('2026/08/16').value).toBe('20260816000000')
        expect(FlexibleDate.parse('2026/08/16').precision).toBe('day')
        expect(FlexibleDate.parse('2026.08.16').value).toBe('20260816000000')
        expect(FlexibleDate.parse('2026/08').precision).toBe('month')
        expect(FlexibleDate.parse('2026 08 15').value).toBe('20260815000000')
        expect(FlexibleDate.parse('2026 08 15').precision).toBe('day')
        expect(FlexibleDate.parse('2026 08 15 19:30').value).toBe('20260815193000')
        expect(FlexibleDate.parse('2026 08 15 19:30').precision).toBe('minute')
        expect(FlexibleDate.parse('2026 08').precision).toBe('month')
    })

    test('huge-digit years and malformed canonicals', () => {
        // A pure digit string that is not a valid YYYYMMDD… pattern is a huge
        // year (year precision), not a 4-digit year plus time groups.
        expect(FlexibleDate.parse('-13800000000000').value).toBe('-138000000000000101235959')
        expect(FlexibleDate.parse('-13800000000000').precision).toBe('year')
        expect(FlexibleDate.parse('13800000000000').value).toBe('138000000000000101000000')
        expect(FlexibleDate.parse('13800000000000').precision).toBe('year')

        // Malformed legacy canonicals (invalid 24:60:60 BC tail) display
        // robustly instead of rendering garbage.
        expect(FlexibleDate.componentsFromCanonical('-138000000000000101246060')).toEqual({
            y: -13800000000000, m: 1, d: 1, h: 0, mi: 0, s: 0,
        })
        expect(FlexibleDate.precisionFromValue('-138000000000000101246060')).toBe('year')
        expect(FlexibleDate.formatBound('-138000000000000101246060', null)).toBe('13800000000000 BC')
    })

    test('BC dates', () => {
        expect(FlexibleDate.parse('-1500').value).toBe('-15000101235959')
        expect(FlexibleDate.parse('1500 до н.э.').value).toBe('-15000101235959')
        expect(FlexibleDate.parse('1500 bc').value).toBe('-15000101235959')
    })

    test('qualifiers', () => {
        for (const input of ['circa 1650', 'около 1650', 'примерно 1650', '~1650']) {
            const d = FlexibleDate.parse(input)
            expect(d).not.toBeNull()
            expect(d.qualifier).toBe('approx')
            expect(d.value).toBe('16500101000000')
        }
        for (const input of ['before 1500', 'до 1500']) {
            expect(FlexibleDate.parse(input).qualifier).toBe('before')
        }
        for (const input of ['after 1500', 'после 1500']) {
            expect(FlexibleDate.parse(input).qualifier).toBe('after')
        }
    })

    test('between', () => {
        for (const input of ['between 1500 and 1600', 'между 1500 и 1600']) {
            const d = FlexibleDate.parse(input)
            expect(d.qualifier).toBe(QUALIFIER_BETWEEN)
            expect(d.value).toBe('15000101000000')
            expect(d.endValue).toBe('16000101000000')
        }
    })

    test('alternatives', () => {
        for (const input of ['1650 or 1670', '1650 или 1670']) {
            const d = FlexibleDate.parse(input)
            expect(d.qualifier).toBe(QUALIFIER_ALTERNATIVES)
            expect(d.alternatives).toEqual(['16500101000000', '16700101000000'])
            expect(d.value).toBe('16500101000000')
            expect(d.endValue).toBe('16700101000000')
        }
    })

    test('eras', () => {
        const d1 = FlexibleDate.parse('7533 am')
        expect(d1.era).toBe(Era.WORLD_CREATION)
        expect(d1.value).toBe('20250114000000')

        expect(FlexibleDate.parse('7533 от сотворения мира').era).toBe(Era.WORLD_CREATION)
        expect(FlexibleDate.parse('1.01.1900 ст.ст.').era).toBe(Era.JULIAN)
        expect(FlexibleDate.parse('1.01.1900 ст.ст.').value).toBe('19000113000000')
        expect(FlexibleDate.parse('1446 хиджра').era).toBe(Era.HIJRI)
        expect(FlexibleDate.parse('5784 ивр.').era).toBe(Era.HEBREW)
        expect(FlexibleDate.parse('2026 н.э.').value).toBe('20260101000000')
    })

    test('invalid input', () => {
        expect(FlexibleDate.parse('')).toBeNull()
        expect(FlexibleDate.parse('banana')).toBeNull()
    })
})

describe('FlexibleDate bounds', () => {
    test('toDb start side', () => {
        expect(FlexibleDate.parse('1940').toDb('start')).toEqual({ start: '19400101000000', end: null, meta: expect.objectContaining({ qualifier: 'exact' }) })
        const before = FlexibleDate.parse('before 1500').toDb('start')
        expect(before.start).toBeNull()
        expect(before.end).toBe('15000101000000')
        expect(FlexibleDate.parse('after 1500').toDb('start').start).toBe('15000101000000')
        expect(FlexibleDate.parse('between 1500 and 1600').toDb('start')).toMatchObject({ start: '15000101000000', end: '16000101000000' })
        expect(FlexibleDate.parse('1650 or 1670').toDb('start')).toMatchObject({ start: '16500101000000', end: '16700101000000' })
        expect(FlexibleDate.parse('2020').toDb('end')).toMatchObject({ start: null, end: '20200101000000' })
    })
})

describe('FlexibleDate formatting', () => {
    test('formatBound', () => {
        expect(FlexibleDate.formatBound('20260101000000', { precision: PRECISION_YEAR })).toBe('2026')
        expect(FlexibleDate.formatBound('20260801000000', { precision: 'month' })).toBe('2026-08')
        expect(FlexibleDate.formatBound('20260815000000', { precision: 'day' })).toBe('2026-08-15')
        expect(FlexibleDate.formatBound('20260815120000', { precision: 'minute' })).toBe('2026-08-15 12:00')
        expect(FlexibleDate.formatBound('-00010101235959', { precision: PRECISION_YEAR })).toBe('1 BC')
        expect(FlexibleDate.formatBound('20250114000000', { precision: PRECISION_YEAR, era: Era.WORLD_CREATION })).toBe('7533 (world_creation)')
    })

    test('year-1 canonical round-trips via the length-10 rule', () => {
        // Engine zero-pads years to 4, but the numeric column strips leading
        // zeros → year-1 reads back as '10101000000' (11 digits). year = length − 10.
        const c = FlexibleDate.componentsFromCanonical('10101000000')
        expect(c.y).toBe(1)
        expect(c.m).toBe(1)
        expect(c.d).toBe(1)
        expect(FlexibleDate.componentsFromCanonical('00010101000000').y).toBe(1)
        expect(FlexibleDate.formatBound('10101000000', { precision: 'year' })).toBe('1')
        expect(FlexibleDate.precisionFromValue('10101000000')).toBe('year')

        // Input paths for 1- and 3-digit years pad the year to 4 first.
        expect(FlexibleDate.parse('1-01-01').value).toBe('00010101000000')
        expect(FlexibleDate.parse('1.1.1').value).toBe('00010101000000')
        expect(FlexibleDate.parse('999-01-01').value).toBe('09990101000000')
    })

    test('precisionFromValue infers precision from the encoded groups', () => {
        // Values < 11 digits are legacy unpadded shapes (4-digit year + groups).
        expect(FlexibleDate.precisionFromValue('2026')).toBe(PRECISION_YEAR)
        expect(FlexibleDate.precisionFromValue('202608')).toBe('month')
        expect(FlexibleDate.precisionFromValue('20260815')).toBe('day')
        expect(FlexibleDate.precisionFromValue('2026081112')).toBe('minute')
        // Values ≥ 11 digits are canonical and always padded to seconds, so the
        // finest precision actually encoded is inferred from the trailing groups.
        expect(FlexibleDate.precisionFromValue('20260815120000')).toBe('minute')   // 12:00
        expect(FlexibleDate.precisionFromValue('20260812000000')).toBe('day')      // day
        expect(FlexibleDate.precisionFromValue('20260801000000')).toBe('month')    // month
        expect(FlexibleDate.precisionFromValue('20260101000000')).toBe('year')     // year
        expect(FlexibleDate.precisionFromValue('20260811123045')).toBe('second')   // 12:30:45
        expect(FlexibleDate.precisionFromValue('10101000000')).toBe('year')        // year 1
        expect(FlexibleDate.precisionFromValue('-15000101235959')).toBe('year')    // 1500 BC, inverted clock
        expect(FlexibleDate.precisionFromValue(null)).toBeNull()
    })

    test('formatBound infers precision from the value when meta has none', () => {
        // Legacy data has no meta.precision — the stored digit length decides.
        expect(FlexibleDate.formatBound('2026081112', {})).toBe('2026-08-11 12:00')
        expect(FlexibleDate.formatBound('2026081122', null)).toBe('2026-08-11 22:00')
        expect(FlexibleDate.formatBound('20260815', {})).toBe('2026-08-15')
        // Explicit meta precision still wins.
        expect(FlexibleDate.formatBound('20260815120000', { precision: PRECISION_YEAR })).toBe('2026')
    })

    test('format() and formatPair', () => {
        expect(FlexibleDate.parse('около 1650').format()).toBe('circa 1650')
        expect(FlexibleDate.parse('before 1500').format()).toBe('before 1500')
        expect(FlexibleDate.parse('between 1500 and 1600').format()).toBe('between 1500 and 1600')
        expect(FlexibleDate.parse('1650 or 1670').format()).toBe('1650 or 1670')

        const birth = FlexibleDate.parse('1940')
        const death = FlexibleDate.parse('2020')
        expect(FlexibleDate.formatPair(birth.value, death.value, birth.toArray(), death.toArray())).toBe('1940 — 2020')
    })

    test('sort order', () => {
        const a = FlexibleDate.parse('2025-12-31')
        const b = FlexibleDate.parse('2026')
        expect(b.value > a.value).toBe(true)
    })

    test('formatRangeShort collapses a same-day time range', () => {
        expect(formatRangeShort('2026081112', '2026081122', null, null, t)).toBe('2026-08-11 12:00 → 22:00')
    })

    test('formatRangeShort keeps two dates when the day differs', () => {
        expect(formatRangeShort('20260811', '20260812', null, null, t)).toBe('2026-08-11 — 2026-08-12')
    })

    test('formatRangeShort handles a single bound', () => {
        expect(formatRangeShort('1650', null, null, null, t)).toBe('1650')
    })

    test('identical start and end show the date once, not twice', () => {
        expect(formatRangeShort('19940308210000', '19940308210000', null, null, t)).toBe('1994-03-08 21:00')
    })

    test('formatRangeShort does not collapse an explicit between range', () => {
        expect(formatRangeShort(
            '20260811120000',
            '20260811220000',
            { qualifier: QUALIFIER_BETWEEN, precision: 'minute' },
            null,
            t,
        )).toBe('between 2026-08-11 12:00 and 2026-08-11 22:00')
    })

    test('parseFuzz accepts values with english and russian units', () => {
        expect(parseFuzz('2 years')).toEqual({ value: 2, unit: 'year' })
        expect(parseFuzz('±5 дней')).toEqual({ value: 5, unit: 'day' })
        expect(parseFuzz('2y')).toEqual({ value: 2, unit: 'year' })
        expect(parseFuzz(' 3 месяца ')).toEqual({ value: 3, unit: 'month' })
        expect(parseFuzz('10 мин.')).toEqual({ value: 10, unit: 'minute' })
        expect(parseFuzz('garbage')).toBeNull()
        expect(parseFuzz('')).toBeNull()
        expect(parseFuzz('±0 years')).toBeNull()
    })

    test('formatBoundLocalized appends the uncertainty margin', () => {
        expect(formatBoundLocalized('20260812000000', { precision: 'day', fuzz: { value: 2, unit: 'year' } }, t))
            .toBe('2026-08-12 ±2 years')
        expect(formatBoundLocalized('20260812000000', { precision: 'day', fuzz: { value: 1, unit: 'day' } }, t))
            .toBe('2026-08-12 ±1 day')
        // No fuzz → unchanged.
        expect(formatBoundLocalized('20260812000000', { precision: 'day' }, t))
            .toBe('2026-08-12')
    })
})
