<?php

namespace Tests\Unit;

use Fokin\Facts\Data\Era;
use Fokin\Facts\Data\FlexibleDate;
use Tests\TestCase;

class FlexibleDateTest extends TestCase
{
    // ─── Era / calendar conversions ───

    public static function gregorianJdnProvider(): array
    {
        return [
            [2000, 1, 1, 2451545],
            [2023, 9, 16, 2460204],
            [622, 7, 19, 1948440],
            [1582, 10, 15, 2299161],
            [-3760, 9, 7, 347998],
        ];
    }

    /**
     * @dataProvider gregorianJdnProvider
     */
    public function testGregorianJdn(int $y, int $m, int $d, int $jdn): void
    {
        $this->assertSame($jdn, Era::gregorianToJDN($y, $m, $d));
        $this->assertSame(
            ['year' => $y, 'month' => $m, 'day' => $d],
            Era::jdnToGregorian($jdn)
        );
    }

    public function testJulianConversion(): void
    {
        // Julian 1900-01-01 = Gregorian 1900-01-13 (13-day drift in 1900s)
        $conv = Era::jdnToGregorian(Era::julianToJDN(1900, 1, 1));
        $this->assertSame(['year' => 1900, 'month' => 1, 'day' => 13], $conv);

        // The 1582 gap: Gregorian 15 Oct 1582 = Julian 5 Oct 1582
        $conv = Era::jdnToJulian(Era::gregorianToJDN(1582, 10, 15));
        $this->assertSame(['year' => 1582, 'month' => 10, 'day' => 5], $conv);

        $this->assertSame(
            ['year' => 1900, 'month' => 1, 'day' => 1],
            Era::jdnToJulian(Era::gregorianToJDN(1900, 1, 13))
        );
    }

    public function testWorldCreationConversion(): void
    {
        // AM 7533, Jan 1 = Gregorian 2025-01-14 (7533 - 5508 for Jan–Aug)
        $conv = Era::toCanonical(Era::WORLD_CREATION, 7533, 1, 1);
        $this->assertSame(['year' => 2025, 'month' => 1, 'day' => 14, 'degrade' => false], $conv);

        // AM 7533, Sep 1 = Gregorian 2024-09-14 (7533 - 5509 for Sep–Dec)
        $conv = Era::toCanonical(Era::WORLD_CREATION, 7533, 9, 1);
        $this->assertSame(['year' => 2024, 'month' => 9, 'day' => 14, 'degrade' => false], $conv);

        // Reverse
        $this->assertSame(
            ['year' => 7533, 'month' => 1, 'day' => 1, 'degrade' => false],
            Era::fromCanonical(Era::WORLD_CREATION, 2025, 1, 14)
        );
    }

    public function testHijriConversion(): void
    {
        // 1 Muharram 1 AH = JDN 1948440 = Gregorian 622-07-19
        $this->assertSame(1948440, Era::hijriToJDN(1, 1, 1));
        $this->assertSame(1948440, Era::gregorianToJDN(622, 7, 19));

        // Round trip
        [$y, $m, $d] = array_values(Era::jdnToHijri(Era::hijriToJDN(1446, 1, 1)));
        $this->assertSame([1446, 1, 1], [$y, $m, $d]);

        // Leap-year month 12 has 30 days
        $this->assertSame(30, Era::hijriMonthLength(2, 12));
        $this->assertSame(29, Era::hijriMonthLength(1, 12));
    }

    public function testHebrewConversion(): void
    {
        // 1 Tishrei 5784 = Gregorian 2023-09-16 (Rosh Hashanah)
        $this->assertSame(2460204, Era::hebrewToJDN(5784, 1, 1));
        $this->assertSame(2460204, Era::gregorianToJDN(2023, 9, 16));

        // Round trip through the middle of a year
        [$y, $m, $d] = array_values(Era::jdnToHebrew(Era::hebrewToJDN(5784, 5, 15)));
        $this->assertSame([5784, 5, 15], [$y, $m, $d]);
    }

    public function testEraDegradation(): void
    {
        // Beyond the supported range, non-Gregorian eras degrade (identity + flag)
        $conv = Era::toCanonical(Era::HEBREW, 50000000, 1, 1);
        $this->assertTrue($conv['degrade']);
        $this->assertSame(50000000, $conv['year']);
    }

    // ─── Parsing ───

    public function testParseDigitStrings(): void
    {
        $d = FlexibleDate::parse('202608151200');
        $this->assertNotNull($d);
        $this->assertSame(FlexibleDate::QUALIFIER_EXACT, $d->qualifier);
        $this->assertSame(FlexibleDate::PRECISION_MINUTE, $d->precision);
        $this->assertSame('20260815120000', $d->value);

        $d = FlexibleDate::parse('2026');
        $this->assertSame(FlexibleDate::PRECISION_YEAR, $d->precision);
        $this->assertSame('20260101000000', $d->value);

        $d = FlexibleDate::parse('202608');
        $this->assertSame(FlexibleDate::PRECISION_MONTH, $d->precision);

        $d = FlexibleDate::parse('20260815');
        $this->assertSame(FlexibleDate::PRECISION_DAY, $d->precision);
    }

    public function testParseIsoAndRussian(): void
    {
        $d = FlexibleDate::parse('2026-08-15');
        $this->assertSame('20260815000000', $d->value);
        $this->assertSame(FlexibleDate::PRECISION_DAY, $d->precision);

        $d = FlexibleDate::parse('15.08.2026');
        $this->assertSame('20260815000000', $d->value);

        $d = FlexibleDate::parse('2026-08');
        $this->assertSame(FlexibleDate::PRECISION_MONTH, $d->precision);
    }

    public function testParseStandardDelimiters(): void
    {
        // Digit date + space-separated time.
        $d = FlexibleDate::parse('20260816 19:30');
        $this->assertNotNull($d);
        $this->assertSame('20260816193000', $d->value);
        $this->assertSame(FlexibleDate::PRECISION_MINUTE, $d->precision);

        $d = FlexibleDate::parse('20260816 19:30:45');
        $this->assertSame('20260816193045', $d->value);
        $this->assertSame(FlexibleDate::PRECISION_SECOND, $d->precision);

        // Year-first with / and . delimiters.
        $d = FlexibleDate::parse('2026/08/16');
        $this->assertSame('20260816000000', $d->value);
        $this->assertSame(FlexibleDate::PRECISION_DAY, $d->precision);

        $d = FlexibleDate::parse('2026.08.16');
        $this->assertSame('20260816000000', $d->value);

        // Year-month with a slash delimiter.
        $d = FlexibleDate::parse('2026/08');
        $this->assertSame(FlexibleDate::PRECISION_MONTH, $d->precision);

        // Space-separated year month day.
        $d = FlexibleDate::parse('2026 08 15');
        $this->assertNotNull($d);
        $this->assertSame('20260815000000', $d->value);
        $this->assertSame(FlexibleDate::PRECISION_DAY, $d->precision);

        $d = FlexibleDate::parse('2026 08 15 19:30');
        $this->assertSame('20260815193000', $d->value);
        $this->assertSame(FlexibleDate::PRECISION_MINUTE, $d->precision);

        $d = FlexibleDate::parse('2026 08');
        $this->assertSame(FlexibleDate::PRECISION_MONTH, $d->precision);
    }

    public function testFuzz(): void
    {
        // parseFuzz accepts english and russian unit aliases.
        $this->assertSame(['value' => 2, 'unit' => 'year'], FlexibleDate::parseFuzz('2 years'));
        $this->assertSame(['value' => 5, 'unit' => 'day'], FlexibleDate::parseFuzz('±5 дней'));
        $this->assertSame(['value' => 2, 'unit' => 'year'], FlexibleDate::parseFuzz('2y'));
        $this->assertSame(['value' => 3, 'unit' => 'month'], FlexibleDate::parseFuzz(' 3 месяца '));
        $this->assertSame(['value' => 10, 'unit' => 'minute'], FlexibleDate::parseFuzz('10 мин.'));
        $this->assertNull(FlexibleDate::parseFuzz('garbage'));
        $this->assertNull(FlexibleDate::parseFuzz(''));
        $this->assertNull(FlexibleDate::parseFuzz('±0 years'));

        // formatFuzz renders an english "±N unit" string.
        $this->assertSame('±2 years', FlexibleDate::formatFuzz(['value' => 2, 'unit' => 'year']));
        $this->assertSame('±1 day', FlexibleDate::formatFuzz(['value' => 1, 'unit' => 'day']));
        $this->assertSame('', FlexibleDate::formatFuzz(null));

        // formatBound appends the margin.
        $this->assertSame(
            '2026-08-12 ±2 years',
            FlexibleDate::formatBound('20260812000000', ['precision' => FlexibleDate::PRECISION_DAY, 'fuzz' => ['value' => 2, 'unit' => 'year']])
        );
        $this->assertSame(
            '2026-08-12',
            FlexibleDate::formatBound('20260812000000', ['precision' => FlexibleDate::PRECISION_DAY])
        );
    }

    public function testParseBc(): void
    {
        // BC dates store an inverted clock so numeric order = chronological.
        $d = FlexibleDate::parse('-1500');
        $this->assertNotNull($d);
        $this->assertSame('-15000101235959', $d->value);

        $d = FlexibleDate::parse('1500 до н.э.');
        $this->assertSame('-15000101235959', $d->value);

        $d = FlexibleDate::parse('1500 bc');
        $this->assertSame('-15000101235959', $d->value);
    }

    public function testParseQualifiers(): void
    {
        foreach (['circa 1650', 'около 1650', 'примерно 1650', '~1650'] as $input) {
            $d = FlexibleDate::parse($input);
            $this->assertNotNull($d, "parse('$input')");
            $this->assertSame(FlexibleDate::QUALIFIER_APPROX, $d->qualifier);
            $this->assertSame('16500101000000', $d->value);
        }

        foreach (['before 1500', 'до 1500'] as $input) {
            $d = FlexibleDate::parse($input);
            $this->assertSame(FlexibleDate::QUALIFIER_BEFORE, $d->qualifier);
            $this->assertSame('15000101000000', $d->value);
        }

        foreach (['after 1500', 'после 1500'] as $input) {
            $d = FlexibleDate::parse($input);
            $this->assertSame(FlexibleDate::QUALIFIER_AFTER, $d->qualifier);
        }
    }

    public function testParseBetween(): void
    {
        foreach (['between 1500 and 1600', 'между 1500 и 1600'] as $input) {
            $d = FlexibleDate::parse($input);
            $this->assertNotNull($d, "parse('$input')");
            $this->assertSame(FlexibleDate::QUALIFIER_BETWEEN, $d->qualifier);
            $this->assertSame('15000101000000', $d->value);
            $this->assertSame('16000101000000', $d->endValue);
        }
    }

    public function testParseAlternatives(): void
    {
        foreach (['1650 or 1670', '1650 или 1670'] as $input) {
            $d = FlexibleDate::parse($input);
            $this->assertNotNull($d, "parse('$input')");
            $this->assertSame(FlexibleDate::QUALIFIER_ALTERNATIVES, $d->qualifier);
            $this->assertSame(['16500101000000', '16700101000000'], $d->alternatives);
            $this->assertSame('16500101000000', $d->value);  // min
            $this->assertSame('16700101000000', $d->endValue); // max
        }
    }

    public function testParseEras(): void
    {
        $d = FlexibleDate::parse('7533 am');
        $this->assertNotNull($d);
        $this->assertSame(Era::WORLD_CREATION, $d->era);
        $this->assertSame('20250114000000', $d->value);

        $d = FlexibleDate::parse('7533 от сотворения мира');
        $this->assertSame(Era::WORLD_CREATION, $d->era);
        $this->assertSame('20250114000000', $d->value);

        $d = FlexibleDate::parse('1.01.1900 ст.ст.');
        $this->assertSame(Era::JULIAN, $d->era);
        $this->assertSame('19000113000000', $d->value);

        $d = FlexibleDate::parse('1446 хиджра');
        $this->assertSame(Era::HIJRI, $d->era);

        $d = FlexibleDate::parse('5784 ивр.');
        $this->assertSame(Era::HEBREW, $d->era);

        $d = FlexibleDate::parse('2026 н.э.');
        $this->assertSame(Era::GREGORIAN, $d->era);
        $this->assertSame('20260101000000', $d->value);
    }

    public function testParseHugeYear(): void
    {
        // Universe-creation scale: -13.8 billion years (ISO year form)
        $d = FlexibleDate::parse('-13800000000-01-01');
        $this->assertNotNull($d);
        $this->assertSame(FlexibleDate::PRECISION_DAY, $d->precision);
        // value is non-null and its year component round-trips
        $this->assertNotNull($d->value);
    }

    public function testParseInvalid(): void
    {
        $this->assertNull(FlexibleDate::parse(''));
        $this->assertNull(FlexibleDate::parse('banana'));
    }

    // ─── Bounds mapping ───

    public function testToDbBounds(): void
    {
        $d = FlexibleDate::parse('1940');
        $bounds = $d->toDb('start');
        $this->assertSame('19400101000000', $bounds['start']);
        $this->assertNull($bounds['end']);

        $d = FlexibleDate::parse('before 1500');
        $bounds = $d->toDb('start');
        $this->assertNull($bounds['start']);
        $this->assertSame('15000101000000', $bounds['end']);

        $d = FlexibleDate::parse('after 1500');
        $bounds = $d->toDb('start');
        $this->assertSame('15000101000000', $bounds['start']);
        $this->assertNull($bounds['end']);

        $d = FlexibleDate::parse('between 1500 and 1600');
        $bounds = $d->toDb('start');
        $this->assertSame('15000101000000', $bounds['start']);
        $this->assertSame('16000101000000', $bounds['end']);

        $d = FlexibleDate::parse('1650 or 1670');
        $bounds = $d->toDb('start');
        $this->assertSame('16500101000000', $bounds['start']);
        $this->assertSame('16700101000000', $bounds['end']);

        // End side: exact date lands in the end column
        $d = FlexibleDate::parse('2020');
        $bounds = $d->toDb('end');
        $this->assertNull($bounds['start']);
        $this->assertSame('20200101000000', $bounds['end']);
    }

    public function testMetaRoundTrip(): void
    {
        $d = FlexibleDate::parse('около 1650');
        $meta = $d->toArray();
        $this->assertSame(FlexibleDate::QUALIFIER_APPROX, $meta['qualifier']);
        $this->assertSame(FlexibleDate::PRECISION_YEAR, $meta['precision']);
        $this->assertSame(Era::GREGORIAN, $meta['era']);

        $rebuilt = FlexibleDate::fromArray($meta);
        $this->assertSame($d->qualifier, $rebuilt->qualifier);
        $this->assertSame($d->precision, $rebuilt->precision);
        $this->assertSame($d->era, $rebuilt->era);
    }

    // ─── Formatting ───

    public function testFormatBound(): void
    {
        $this->assertSame('2026', FlexibleDate::formatBound('20260101000000', ['precision' => FlexibleDate::PRECISION_YEAR]));
        $this->assertSame('2026-08', FlexibleDate::formatBound('20260801000000', ['precision' => FlexibleDate::PRECISION_MONTH]));
        $this->assertSame('2026-08-15', FlexibleDate::formatBound('20260815000000', ['precision' => FlexibleDate::PRECISION_DAY]));
        $this->assertSame('2026-08-15 12:00', FlexibleDate::formatBound('20260815120000', ['precision' => FlexibleDate::PRECISION_MINUTE]));
        $this->assertSame('1 BC', FlexibleDate::formatBound('-00010101235959', ['precision' => FlexibleDate::PRECISION_YEAR]));
        $this->assertSame(
            '7533 (world_creation)',
            FlexibleDate::formatBound('20250114000000', ['precision' => FlexibleDate::PRECISION_YEAR, 'era' => Era::WORLD_CREATION])
        );
    }

    public function testPrecisionFromValue(): void
    {
        // Values < 11 digits are legacy unpadded shapes (4-digit year + groups).
        $this->assertSame(FlexibleDate::PRECISION_YEAR, FlexibleDate::precisionFromValue('2026'));
        $this->assertSame(FlexibleDate::PRECISION_MONTH, FlexibleDate::precisionFromValue('202608'));
        $this->assertSame(FlexibleDate::PRECISION_DAY, FlexibleDate::precisionFromValue('20260815'));
        $this->assertSame(FlexibleDate::PRECISION_MINUTE, FlexibleDate::precisionFromValue('2026081112'));
        // Values ≥ 11 digits are canonical (variable year + 10-digit tail) and
        // always padded to seconds, so the finest precision actually encoded is
        // inferred from the trailing groups.
        $this->assertSame(FlexibleDate::PRECISION_MINUTE, FlexibleDate::precisionFromValue('20260815120000'));  // 12:00
        $this->assertSame(FlexibleDate::PRECISION_DAY, FlexibleDate::precisionFromValue('20260812000000'));      // day
        $this->assertSame(FlexibleDate::PRECISION_MONTH, FlexibleDate::precisionFromValue('20260801000000'));    // month
        $this->assertSame(FlexibleDate::PRECISION_YEAR, FlexibleDate::precisionFromValue('20260101000000'));     // year
        $this->assertSame(FlexibleDate::PRECISION_SECOND, FlexibleDate::precisionFromValue('20260811123045'));   // 12:30:45
        $this->assertSame(FlexibleDate::PRECISION_YEAR, FlexibleDate::precisionFromValue('10101000000'));        // year 1 (BC-inverted clock still year)
        $this->assertSame(FlexibleDate::PRECISION_YEAR, FlexibleDate::precisionFromValue('-15000101235959'));    // 1500 BC, inverted clock
        $this->assertNull(FlexibleDate::precisionFromValue(null));
    }

    public function testYearOneCanonicalRoundTrip(): void
    {
        // The engine zero-pads years ≤ 4 digits to 4 ('0001'), but the numeric
        // column strips the leading zeros, so a year-1 date reads back as
        // '10101000000' (11 digits). The canonical read-back rule must then be
        // `year = length - 10` — never a fixed 4-digit-year assumption.
        $c = FlexibleDate::componentsFromCanonical('10101000000');
        $this->assertSame(1, $c['y']);
        $this->assertSame(1, $c['m']);
        $this->assertSame(1, $c['d']);

        // Same value in its zero-padded 14-digit form (before storage).
        $c = FlexibleDate::componentsFromCanonical('00010101000000');
        $this->assertSame(1, $c['y']);

        $this->assertSame('1', FlexibleDate::formatBound('10101000000', ['precision' => FlexibleDate::PRECISION_YEAR]));
        $this->assertSame(FlexibleDate::PRECISION_YEAR, FlexibleDate::precisionFromValue('10101000000'));

        // Input paths for 1- and 3-digit years produce canonical values with
        // the year zero-padded (the flexible-date layer pads before the engine).
        $this->assertSame('00010101000000', FlexibleDate::parse('1-01-01')->value);
        $this->assertSame('00010101000000', FlexibleDate::parse('1.1.1')->value);
        $this->assertSame('09990101000000', FlexibleDate::parse('999-01-01')->value);
    }

    public function testCanonicalSmallYearSortOrder(): void
    {
        // value = year × 10^10 + tail is monotonic in the year even though the
        // digit count varies after leading-zero stripping.
        $year1   = '10101000000';   // year 1
        $year1000 = '10000101000000'; // year 1000
        $year9999 = '99990101000000'; // year 9999
        $this->assertSame(1, bccomp($year1000, $year1));
        $this->assertSame(1, bccomp($year9999, $year1000));
    }

    public function testFormatBoundInfersPrecisionWithoutMeta(): void
    {
        // Legacy data has no meta.precision — the stored digit length decides.
        $this->assertSame('2026-08-11 12:00', FlexibleDate::formatBound('2026081112', []));
        $this->assertSame('2026-08-11 22:00', FlexibleDate::formatBound('2026081122', null));
        $this->assertSame('2026-08-15', FlexibleDate::formatBound('20260815', []));
        // Explicit meta precision still wins.
        $this->assertSame('2026', FlexibleDate::formatBound('20260815120000', ['precision' => FlexibleDate::PRECISION_YEAR]));
    }

    public function testFormatPair(): void
    {
        $d = FlexibleDate::parse('около 1650');
        $this->assertSame('circa 1650', $d->format());

        $d = FlexibleDate::parse('before 1500');
        $this->assertSame('before 1500', $d->format());

        $d = FlexibleDate::parse('between 1500 and 1600');
        $this->assertSame('between 1500 and 1600', $d->format());

        $d = FlexibleDate::parse('1650 or 1670');
        $this->assertSame('1650 or 1670', $d->format());

        // Person: birth 1940 + death 2020
        $birth = FlexibleDate::parse('1940');
        $death = FlexibleDate::parse('2020');
        $this->assertSame(
            '1940 — 2020',
            FlexibleDate::formatPair($birth->value, $death->value, $birth->toArray(), $death->toArray())
        );

        // Identical bounds show the date once, not twice. The value's trailing
        // zeros imply minute precision (21:00), so seconds are not displayed.
        $this->assertSame(
            '1994-03-08 21:00',
            FlexibleDate::formatPair('19940308210000', '19940308210000', [], null)
        );
    }

    public function testSortOrder(): void
    {
        $a = FlexibleDate::parse('2025-12-31');
        $b = FlexibleDate::parse('2026'); // year-only must sort AFTER 2025-12-31
        $this->assertSame(1, bccomp($b->value, $a->value));
    }
}
