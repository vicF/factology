<?php

namespace Fokin\Facts\Data;

/**
 * Calendar/era registry ("летоисчисление").
 *
 * Converts dates in various calendars to a canonical proleptic Gregorian date
 * (astronomical year numbering: year 0 = 1 BC, negative years for BC).
 *
 * All conversions use exact integer JDN arithmetic (Meeus for Gregorian/Julian,
 * tabular civil epoch for Hijri, Reingold–Dershowitz molad + postponements for
 * Hebrew). This file is mirrored by resources/js/constants/eras.js — both must
 * implement the same math so results are identical in PHP and JS.
 */
class Era
{
    public const GREGORIAN = 'gregorian';
    public const JULIAN = 'julian';
    public const WORLD_CREATION = 'world_creation'; // Anno Mundi, "от сотворения мира"
    public const HIJRI = 'hijri';
    public const HEBREW = 'hebrew';

    /**
     * Non-Gregorian eras are exact within this many years of the present.
     * Beyond that the conversion degrades to the canonical Gregorian date and
     * sets 'degrade' => true (keeps the decimal(28,0) numeric core untouched).
     */
    public const MAX_ERA_YEAR = 10000000;

    /** Era keys with display labels (i18n message keys, en + ru). */
    public const LABELS = [
        self::GREGORIAN       => 'era.gregorian',
        self::JULIAN          => 'era.julian',
        self::WORLD_CREATION  => 'era.world_creation',
        self::HIJRI           => 'era.hijri',
        self::HEBREW          => 'era.hebrew',
    ];

    public static function keys(): array
    {
        return array_keys(self::LABELS);
    }

    public static function isValid(string $key): bool
    {
        return isset(self::LABELS[$key]);
    }

    public static function label(string $key): string
    {
        return self::LABELS[$key] ?? self::LABELS[self::GREGORIAN];
    }

    /**
     * Exact integer floor division. PHP's intdiv() truncates toward zero;
     * the Meeus/Reingold algorithms need floor semantics for negative values.
     */
    public static function floorDiv(int $a, int $b): int
    {
        $q = intdiv($a, $b);
        $r = $a % $b;
        if ($r !== 0 && (($a < 0) !== ($b < 0))) {
            --$q;
        }
        return $q;
    }

    // ─── Gregorian (proleptic, astronomical year numbering) ───

    public static function gregorianToJDN(int $year, int $month, int $day): int
    {
        $a = self::floorDiv(14 - $month, 12);
        $y = $year + 4800 - $a;
        $m = $month + 12 * $a - 3;
        return $day + self::floorDiv(153 * $m + 2, 5) + 365 * $y
            + self::floorDiv($y, 4) - self::floorDiv($y, 100) + self::floorDiv($y, 400) - 32045;
    }

    public static function jdnToGregorian(int $jdn): array
    {
        $a = $jdn + 32044;
        $b = self::floorDiv(4 * $a + 3, 146097);
        $c = $a - self::floorDiv(146097 * $b, 4);
        $d = self::floorDiv(4 * $c + 3, 1461);
        $e = $c - self::floorDiv(1461 * $d, 4);
        $m = self::floorDiv(5 * $e + 2, 153);
        $day = $e - self::floorDiv(153 * $m + 2, 5) + 1;
        $month = $m + 3 - 12 * self::floorDiv($m, 10);
        $year = 100 * $b + $d - 4800 + self::floorDiv($m, 10);
        return ['year' => $year, 'month' => $month, 'day' => $day];
    }

    // ─── Julian (proleptic) ───

    public static function julianToJDN(int $year, int $month, int $day): int
    {
        $a = self::floorDiv(14 - $month, 12);
        $y = $year + 4800 - $a;
        $m = $month + 12 * $a - 3;
        return $day + self::floorDiv(153 * $m + 2, 5) + 365 * $y
            + self::floorDiv($y, 4) - 32083;
    }

    public static function jdnToJulian(int $jdn): array
    {
        $c = $jdn + 32082;
        $d = self::floorDiv(4 * $c + 3, 1461);
        $e = $c - self::floorDiv(1461 * $d, 4);
        $m = self::floorDiv(5 * $e + 2, 153);
        $day = $e - self::floorDiv(153 * $m + 2, 5) + 1;
        $month = $m + 3 - 12 * self::floorDiv($m, 10);
        $year = $d - 4800 + self::floorDiv($m, 10);
        return ['year' => $year, 'month' => $month, 'day' => $day];
    }

    // ─── Hijri (tabular / civil Islamic calendar) ───

    public static function isHijriLeap(int $year): bool
    {
        return (($year * 11 + 14) % 30) < 11;
    }

    public static function hijriMonthLength(int $year, int $month): int
    {
        if ($month === 12) {
            return self::isHijriLeap($year) ? 30 : 29;
        }
        return ($month % 2 === 1) ? 30 : 29; // odd months 30, even months 29
    }

    /** 1 Muharram 1 AH = JDN 1948440 (civil epoch). */
    public static function hijriToJDN(int $year, int $month, int $day): int
    {
        $daysBeforeYear = ($year - 1) * 354 + self::floorDiv(3 + 11 * $year, 30);
        $daysBeforeMonth = 0;
        for ($m = 1; $m < $month; $m++) {
            $daysBeforeMonth += self::hijriMonthLength($year, $m);
        }
        return 1948440 + $daysBeforeYear + $daysBeforeMonth + $day - 1;
    }

    public static function jdnToHijri(int $jdn): array
    {
        $days = $jdn - 1948440;
        $year = self::floorDiv(30 * $days + 10646, 10631);
        while (self::hijriToJDN($year, 1, 1) > $jdn) {
            --$year;
        }
        while (self::hijriToJDN($year + 1, 1, 1) <= $jdn) {
            ++$year;
        }
        $start = self::hijriToJDN($year, 1, 1);
        for ($month = 1; $month <= 12; $month++) {
            $len = self::hijriMonthLength($year, $month);
            if ($jdn < $start + $len) {
                return ['year' => $year, 'month' => $month, 'day' => $jdn - $start + 1];
            }
            $start += $len;
        }
        return ['year' => $year, 'month' => 12, 'day' => $jdn - $start + 1];
    }

    // ─── Hebrew (lunisolar, Reingold–Dershowitz molad + postponements) ───

    public static function isHebrewLeap(int $year): bool
    {
        return (7 * $year + 1) % 19 < 7;
    }

    /**
     * JDN of 1 Tishrei (Rosh Hashanah) of the given year.
     * Verified against modern anchors: 1 Tishrei 5784 = JDN 2460204 = 2023-09-16.
     */
    public static function hebrewNewYear(int $year): int
    {
        $monthsElapsed = self::floorDiv(235 * $year - 234, 19);
        $partsElapsed = 12084 + 13753 * $monthsElapsed;
        $day = $monthsElapsed * 29 + self::floorDiv($partsElapsed, 25920);
        $parts = $partsElapsed % 25920;
        $leap = self::isHebrewLeap($year);
        if ($parts >= 19440
            || ($day % 7 === 2 && $parts >= 9924 && !$leap)
            || ($day % 7 === 1 && $parts >= 16789 && $leap)) {
            ++$day;
        }
        if ($day % 7 === 0 || $day % 7 === 3 || $day % 7 === 5) {
            ++$day;
        }
        return $day + 347999; // map the "elapsed days" scale onto JDN
    }

    public static function hebrewYearLength(int $year): int
    {
        return self::hebrewNewYear($year + 1) - self::hebrewNewYear($year);
    }

    public static function hebrewMonthLength(int $year, int $month): int
    {
        $leap = self::isHebrewLeap($year);
        $ylen = self::hebrewYearLength($year);
        switch ($month) {
            case 1: return 30;                                                  // Tishrei
            case 2: return ($ylen === 355 || $ylen === 385) ? 30 : 29;          // Cheshvan
            case 3: return ($ylen === 353 || $ylen === 383) ? 29 : 30;          // Kislev
            case 4: return 29;                                                  // Tevet
            case 5: return 30;                                                  // Shevat
            case 6: return $leap ? 30 : 29;                                     // Adar I / Adar
            case 7: return $leap ? 29 : 30;                                     // Adar II / Nisan
            case 8: return $leap ? 30 : 29;                                     // Nisan / Iyar
            default: return (((($month + ($leap ? 1 : 0)) % 2) === 1) ? 30 : 29); // Sivan..Elul
        }
    }

    public static function hebrewToJDN(int $year, int $month, int $day): int
    {
        $jdn = self::hebrewNewYear($year);
        for ($m = 1; $m < $month; $m++) {
            $jdn += self::hebrewMonthLength($year, $m);
        }
        return $jdn + $day - 1;
    }

    public static function jdnToHebrew(int $jdn): array
    {
        $fixed = $jdn - 1721425;
        $year = (int) floor(($fixed + 1373429) / 365.24682220597794);
        while (self::hebrewNewYear($year) > $jdn) {
            --$year;
        }
        while (self::hebrewNewYear($year + 1) <= $jdn) {
            ++$year;
        }
        $start = self::hebrewNewYear($year);
        for ($month = 1; $month <= 13; $month++) {
            $len = self::hebrewMonthLength($year, $month);
            if ($jdn < $start + $len) {
                return ['year' => $year, 'month' => $month, 'day' => $jdn - $start + 1];
            }
            $start += $len;
        }
        return ['year' => $year, 'month' => 13, 'day' => $jdn - $start + 1];
    }

    // ─── Era ⇄ canonical Gregorian ───

    /**
     * Convert an era-calendar date to the canonical proleptic Gregorian date.
     * Astronomical year numbering: year 0 = 1 BC, negative years for BC.
     *
     * @return array{year: int, month: int, day: int, degrade: bool}
     */
    public static function toCanonical(string $era, int $year, int $month, int $day): array
    {
        switch ($era) {
            case self::GREGORIAN:
                return ['year' => $year, 'month' => $month, 'day' => $day, 'degrade' => false];
            case self::JULIAN:
                if (abs($year) > self::MAX_ERA_YEAR) {
                    break;
                }
                return self::jdnToGregorian(self::julianToJDN($year, $month, $day)) + ['degrade' => false];
            case self::WORLD_CREATION:
                if (abs($year) > self::MAX_ERA_YEAR + 5509) {
                    break;
                }
                // AM year N spans Sept N-5509 .. Aug N-5508 (Julian calendar).
                $julianYear = $year - ($month >= 9 ? 5509 : 5508);
                return self::jdnToGregorian(self::julianToJDN($julianYear, $month, $day)) + ['degrade' => false];
            case self::HIJRI:
                if (abs($year) > self::MAX_ERA_YEAR) {
                    break;
                }
                return self::jdnToGregorian(self::hijriToJDN($year, $month, $day)) + ['degrade' => false];
            case self::HEBREW:
                if (abs($year) > self::MAX_ERA_YEAR) {
                    break;
                }
                return self::jdnToGregorian(self::hebrewToJDN($year, $month, $day)) + ['degrade' => false];
        }
        return ['year' => $year, 'month' => $month, 'day' => $day, 'degrade' => true];
    }

    /**
     * Convert a canonical proleptic Gregorian date to an era-calendar date.
     *
     * @return array{year: int, month: int, day: int, degrade: bool}
     */
    public static function fromCanonical(string $era, int $year, int $month, int $day): array
    {
        switch ($era) {
            case self::GREGORIAN:
                return ['year' => $year, 'month' => $month, 'day' => $day, 'degrade' => false];
            case self::JULIAN:
                if (abs($year) > self::MAX_ERA_YEAR) {
                    break;
                }
                return self::jdnToJulian(self::gregorianToJDN($year, $month, $day)) + ['degrade' => false];
            case self::WORLD_CREATION:
                if (abs($year) > self::MAX_ERA_YEAR) {
                    break;
                }
                $julian = self::jdnToJulian(self::gregorianToJDN($year, $month, $day));
                $amYear = $julian['year'] + ($julian['month'] >= 9 ? 5509 : 5508);
                return ['year' => $amYear, 'month' => $julian['month'], 'day' => $julian['day'], 'degrade' => false];
            case self::HIJRI:
                if (abs($year) > self::MAX_ERA_YEAR) {
                    break;
                }
                return self::jdnToHijri(self::gregorianToJDN($year, $month, $day)) + ['degrade' => false];
            case self::HEBREW:
                if (abs($year) > self::MAX_ERA_YEAR) {
                    break;
                }
                return self::jdnToHebrew(self::gregorianToJDN($year, $month, $day)) + ['degrade' => false];
        }
        return ['year' => $year, 'month' => $month, 'day' => $day, 'degrade' => true];
    }
}
