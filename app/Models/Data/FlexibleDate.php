<?php

namespace Fokin\Facts\Data;

use App\Models\Classes\Everything;

/**
 * A flexible date: a sortable canonical value (padded numeric digit string in
 * the existing YmdHis encoding) plus display metadata (qualifier, precision,
 * calendar/era, alternatives, comment). Mirrored by resources/js/utils/flexibleDate.js.
 *
 * Canonical values are produced by Everything::dateToDb and compared with
 * bccomp — padded so mixed-precision values sort chronologically.
 */
class FlexibleDate
{
    public const QUALIFIER_EXACT = 'exact';
    public const QUALIFIER_APPROX = 'approx';
    public const QUALIFIER_BEFORE = 'before';
    public const QUALIFIER_AFTER = 'after';
    public const QUALIFIER_BETWEEN = 'between';
    public const QUALIFIER_ALTERNATIVES = 'alternatives';
    public const QUALIFIER_UNKNOWN = 'unknown';

    public const QUALIFIERS = [
        self::QUALIFIER_EXACT,
        self::QUALIFIER_APPROX,
        self::QUALIFIER_BEFORE,
        self::QUALIFIER_AFTER,
        self::QUALIFIER_BETWEEN,
        self::QUALIFIER_ALTERNATIVES,
        self::QUALIFIER_UNKNOWN,
    ];

    public const PRECISION_YEAR = 'year';
    public const PRECISION_MONTH = 'month';
    public const PRECISION_DAY = 'day';
    public const PRECISION_MINUTE = 'minute';
    public const PRECISION_SECOND = 'second';

    public const PRECISIONS = [
        self::PRECISION_YEAR, self::PRECISION_MONTH, self::PRECISION_DAY,
        self::PRECISION_MINUTE, self::PRECISION_SECOND,
    ];

    public ?string $qualifier = self::QUALIFIER_EXACT;
    public ?string $era = Era::GREGORIAN;
    public ?string $precision = self::PRECISION_YEAR;
    public ?string $value = null;      // canonical padded digit string (main value / lower bound)
    public ?string $endValue = null;   // canonical padded digit string (upper bound)
    public array $alternatives = [];
    public ?string $comment = null;
    public ?string $original = null;
    public bool $degrade = false;
    /** Uncertainty margin: ['value' => 2, 'unit' => 'year'] → "±2 years". */
    public ?array $fuzz = null;

    // ─── Serialization ───

    public function toArray(): array
    {
        $out = [];
        foreach (['qualifier', 'era', 'precision'] as $k) {
            if ($this->$k !== null) {
                $out[$k] = $this->$k;
            }
        }
        if (!empty($this->alternatives)) {
            $out['alternatives'] = array_values($this->alternatives);
        }
        foreach (['comment', 'original'] as $k) {
            if ($this->$k !== null && $this->$k !== '') {
                $out[$k] = $this->$k;
            }
        }
        if ($this->degrade) {
            $out['degrade'] = true;
        }
        if (!empty($this->fuzz['value'])) {
            $out['fuzz'] = ['value' => (int) $this->fuzz['value'], 'unit' => $this->fuzz['unit'] ?? 'year'];
        }
        return $out;
    }

    public static function fromArray(?array $data): ?self
    {
        if (empty($data) || !is_array($data)) {
            return null;
        }
        $d = new self();
        $d->qualifier = in_array($data['qualifier'] ?? null, self::QUALIFIERS, true)
            ? $data['qualifier'] : self::QUALIFIER_EXACT;
        $d->era = Era::isValid($data['era'] ?? '') ? $data['era'] : Era::GREGORIAN;
        $d->precision = in_array($data['precision'] ?? null, self::PRECISIONS, true)
            ? $data['precision'] : self::PRECISION_DAY;
        $d->value = isset($data['value']) ? (string) $data['value'] : null;
        $d->endValue = isset($data['endValue']) ? (string) $data['endValue'] : null;
        $d->alternatives = array_map('strval', $data['alternatives'] ?? []);
        $d->comment = $data['comment'] ?? null;
        $d->original = $data['original'] ?? null;
        $d->degrade = !empty($data['degrade']);
        if (!empty($data['fuzz']['value'])) {
            $d->fuzz = ['value' => (int) $data['fuzz']['value'], 'unit' => $data['fuzz']['unit'] ?? 'year'];
        }
        return $d;
    }

    // ─── Uncertainty margin ("fuzz") ───
    // Legacy start_variety/end_variety encoded this as an opaque number; the
    // flexible-date meta stores it structured as ['value' => N, 'unit' => ...].

    private const FUZZ_UNITS = ['year', 'month', 'day', 'hour', 'minute', 'second'];

    private const FUZZ_UNIT_ALIASES = [
        'year' => 'year', 'years' => 'year', 'y' => 'year', 'г' => 'year', 'год' => 'year', 'года' => 'year', 'лет' => 'year',
        'month' => 'month', 'months' => 'month', 'мес' => 'month', 'мес.' => 'month', 'месяц' => 'month', 'месяца' => 'month', 'месяцев' => 'month',
        'day' => 'day', 'days' => 'day', 'd' => 'day', 'дн' => 'day', 'дн.' => 'day', 'день' => 'day', 'дня' => 'day', 'дней' => 'day',
        'hour' => 'hour', 'hours' => 'hour', 'h' => 'hour', 'ч' => 'hour', 'час' => 'hour', 'часа' => 'hour', 'часов' => 'hour',
        'minute' => 'minute', 'minutes' => 'minute', 'min' => 'minute', 'мин' => 'minute', 'мин.' => 'minute', 'минута' => 'minute', 'минуты' => 'minute', 'минут' => 'minute',
        'second' => 'second', 'seconds' => 'second', 'sec' => 'second', 'сек' => 'second', 'сек.' => 'second', 'секунда' => 'second', 'секунды' => 'second', 'секунд' => 'second',
    ];

    public static function parseFuzz(?string $text): ?array
    {
        $s = trim((string) $text);
        $s = preg_replace('/^±\s*/u', '', $s) ?? $s;
        if ($s === '') {
            return null;
        }
        if (!preg_match('/^(\d{1,4})\s*(.+)$/u', $s, $m)) {
            return null;
        }
        $unit = self::FUZZ_UNIT_ALIASES[mb_strtolower($m[2])] ?? null;
        if ($unit === null) {
            return null;
        }
        $value = (int) $m[1];
        if ($value <= 0 || $value > 9999) {
            return null;
        }
        return ['value' => $value, 'unit' => $unit];
    }

    public static function formatFuzz(?array $fuzz): string
    {
        if (empty($fuzz['value'])) {
            return '';
        }
        $n = (int) $fuzz['value'];
        if ($n <= 0) {
            return '';
        }
        $unit = in_array($fuzz['unit'] ?? null, self::FUZZ_UNITS, true) ? $fuzz['unit'] : 'year';
        $plural = $n === 1 ? $unit : $unit . 's';
        return '±' . $n . ' ' . $plural;
    }

    // ─── Parsing ───

    private const QUALIFIER_PREFIXES = [
        '/^(?:circa|approx|approximate|around|about)\s+(.+)$/iu' => self::QUALIFIER_APPROX,
        '/^(?:около|примерно|приблизительно|прибл\.?)\s+(.+)$/iu' => self::QUALIFIER_APPROX,
        '/^~\s*(.+)$/iu' => self::QUALIFIER_APPROX,
        '/^before\s+(.+)$/iu' => self::QUALIFIER_BEFORE,
        '/^до\s+(.+)$/iu' => self::QUALIFIER_BEFORE,
        '/^after\s+(.+)$/iu' => self::QUALIFIER_AFTER,
        '/^после\s+(.+)$/iu' => self::QUALIFIER_AFTER,
    ];

    private const ERA_MARKERS = [
        'от сотворения мира' => Era::WORLD_CREATION,
        'от с.м.' => Era::WORLD_CREATION,
        'анно мунди' => Era::WORLD_CREATION,
        'старый стиль' => Era::JULIAN,
        'по старому стилю' => Era::JULIAN,
        'ст.ст.' => Era::JULIAN,
        'ст ст' => Era::JULIAN,
        'юлианский' => Era::JULIAN,
        'julian' => Era::JULIAN,
        'old style' => Era::JULIAN,
        'хиджра' => Era::HIJRI,
        'исламский' => Era::HIJRI,
        'hijri' => Era::HIJRI,
        'еврейский' => Era::HEBREW,
        'иудейский' => Era::HEBREW,
        'ивр.' => Era::HEBREW,
        'hebrew' => Era::HEBREW,
    ];

    /**
     * Parse a human expression into a FlexibleDate.
     * Accepts: digit strings of any precision ("202608151200"), ISO dates,
     * Russian "d.m.Y", qualifiers ("circa/около", "before/до", "after/после",
     * "between A and B"/"между A и B"), alternatives ("A or B"/"A или B"),
     * era suffixes ("AM", "от сотворения мира", "ст. ст.", "хиджра", "евр.",
     * "н.э.", "до н.э.", "BC", "AD") in Russian and English.
     *
     * Returns null when the input cannot be parsed.
     */
    public static function parse(string $input, ?string $defaultEra = null): ?self
    {
        $original = trim($input);
        if ($original === '') {
            return null;
        }
        $text = mb_strtolower($original, 'UTF-8');

        $d = new self();
        $d->original = $original;
        $d->era = ($defaultEra !== null && Era::isValid($defaultEra)) ? $defaultEra : Era::GREGORIAN;

        if (in_array($text, ['unknown', '?', 'н/д', 'неизвестно'], true)) {
            $d->qualifier = self::QUALIFIER_UNKNOWN;
            return $d;
        }

        // Alternatives: "A or B or C"
        $parts = preg_split('/\s+(?:or|или)\s+/u', $text);
        if (count($parts) > 1) {
            $d->qualifier = self::QUALIFIER_ALTERNATIVES;
            $precision = null;
            foreach ($parts as $part) {
                $era = $d->era;
                $canonical = self::canonicalFromDateText($part, $era, $p);
                if ($canonical === null) {
                    return null;
                }
                $d->alternatives[] = $canonical;
                $d->era = $era;
                $precision = self::maxPrecision($precision, $p);
            }
            $vals = array_values(array_filter($d->alternatives, static fn ($v) => $v !== null));
            $d->value = $vals ? min($vals) : null;
            $d->endValue = $vals ? max($vals) : null;
            $d->precision = $precision ?? self::PRECISION_DAY;
            return $d;
        }

        // Between: "between A and B" / "между A и B"
        if (preg_match('/^between\s+(.+?)\s+and\s+(.+)$/u', $text, $m)
            || preg_match('/^между\s+(.+?)\s+и\s+(.+)$/u', $text, $m)) {
            $d->qualifier = self::QUALIFIER_BETWEEN;
            $era = $d->era;
            $d->value = self::canonicalFromDateText($m[1], $era, $p1);
            if ($d->value === null) {
                return null;
            }
            $d->era = $era;
            $d->endValue = self::canonicalFromDateText($m[2], $era, $p2);
            if ($d->endValue === null) {
                return null;
            }
            $d->era = $era;
            $d->precision = self::maxPrecision($p1, $p2);
            return $d;
        }

        // Qualifier prefix
        foreach (self::QUALIFIER_PREFIXES as $regex => $qualifier) {
            if (preg_match($regex, $text, $m)) {
                $d->qualifier = $qualifier;
                $era = $d->era;
                $d->value = self::canonicalFromDateText($m[1], $era, $precision);
                if ($d->value === null) {
                    return null;
                }
                $d->era = $era;
                $d->precision = $precision ?? self::PRECISION_DAY;
                return $d;
            }
        }

        // Bare date
        $era = $d->era;
        $d->value = self::canonicalFromDateText($text, $era, $precision);
        if ($d->value === null) {
            return null;
        }
        $d->era = $era;
        $d->precision = $precision ?? self::PRECISION_DAY;
        return $d;
    }

    /**
     * Parse a bare date expression (no qualifier), detecting era/BC suffixes,
     * and return its canonical padded digit string. Sets $era and $precision.
     */
    private static function canonicalFromDateText(string $text, ?string &$era, ?string &$precision): ?string
    {
        $text = trim($text);
        if ($text === '') {
            return null;
        }

        $bc = false;
        // BC markers (must precede AD/era detection so "до н.э." is consumed here)
        if (preg_match('/(?:^|\s)(?:до н\.?э\.?|bc|b\.c\.)(?:$|\s)/iu', $text)) {
            $bc = true;
            $text = trim(preg_replace('/(?:^|\s)(?:до н\.?э\.?|bc|b\.c\.)(?:$|\s)/iu', ' ', $text));
        }
        // Explicit AD
        if (preg_match('/(?:^|\s)(?:н\.э\.?|ad|a\.d\.)(?:$|\s)/iu', $text)) {
            $text = trim(preg_replace('/(?:^|\s)(?:н\.э\.?|ad|a\.d\.)(?:$|\s)/iu', ' ', $text));
        }
        // Calendar/era suffixes
        foreach (self::ERA_MARKERS as $marker => $targetEra) {
            if (str_contains($text, $marker)) {
                $era = $targetEra;
                $text = trim(str_replace($marker, '', $text));
                break;
            }
        }
        // Word-boundary "am" / "ah" era markers (would otherwise parse as a year)
        if (preg_match('/(?:^|\s)am(?:$|\s)/iu', $text)) {
            $era = Era::WORLD_CREATION;
            $text = trim(preg_replace('/(?:^|\s)am(?:$|\s)/iu', ' ', $text));
        } elseif (preg_match('/(?:^|\s)ah(?:$|\s)/iu', $text)) {
            $era = Era::HIJRI;
            $text = trim(preg_replace('/(?:^|\s)ah(?:$|\s)/iu', ' ', $text));
        }

        $components = self::parseDateComponents($text, $precision);
        if ($components === null) {
            return null;
        }
        if ($bc) {
            $components['y'] = -$components['y'];
        }

        return self::canonicalFromComponents(
            $components['y'], $components['m'], $components['d'],
            $components['h'], $components['mi'], $components['s'], $era
        );
    }

    /**
     * Parse a bare date into components. Returns null if unparseable.
     * $precision is set to the finest component present.
     */
    private static function parseDateComponents(string $text, ?string &$precision): ?array
    {
        $text = trim($text);

        // Russian format: d.m.Y (or d.m.Y H:i)
        if (preg_match('/^(\d{1,2})\.(\d{1,2})\.(\d{1,4})(?:[ T](\d{1,2}):(\d{2}))?$/', $text, $m)) {
            $precision = isset($m[5]) ? self::PRECISION_MINUTE
                : (isset($m[4]) ? self::PRECISION_MINUTE : self::PRECISION_DAY);
            return [
                'y' => (int) $m[3], 'm' => (int) $m[2], 'd' => (int) $m[1],
                'h' => (int) ($m[4] ?? 0), 'mi' => (int) ($m[5] ?? 0), 's' => 0,
            ];
        }

        // Digit date + space-separated time: "20260816 19:30" (also with seconds)
        if (preg_match('/^(\d{8})\s+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/', $text, $m)) {
            $h = (int) $m[2];
            $mi = isset($m[3]) && $m[3] !== '' ? (int) $m[3] : 0;
            $s = isset($m[4]) && $m[4] !== '' ? (int) $m[4] : 0;
            if ($h > 23 || $mi > 59 || $s > 59) {
                return null;
            }
            $parts = self::splitDigitDate($m[1]);
            $precision = isset($m[4]) && $m[4] !== '' ? self::PRECISION_SECOND : self::PRECISION_MINUTE;
            return [
                'y' => (int) $parts['y'], 'm' => (int) $parts['mo'], 'd' => (int) $parts['d'],
                'h' => $h, 'mi' => $mi, 's' => $s,
            ];
        }

        // Year-first with standard delimiters: "2026-08", "2026-08-16", "2026/08/16",
        // "2026.08.16" (all optionally followed by a space/T-separated time).
        if (preg_match('~^(-?\d+)[/.-](\d{1,2})(?:[/.-](\d{1,2}))?(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$~', $text, $m)) {
            $year = (int) $m[1];
            $month = (int) $m[2];
            $day = isset($m[3]) && $m[3] !== '' ? (int) $m[3] : null;
            $hour = isset($m[4]) && $m[4] !== '' ? (int) $m[4] : 0;
            $min = isset($m[5]) && $m[5] !== '' ? (int) $m[5] : 0;
            $sec = isset($m[6]) && $m[6] !== '' ? (int) $m[6] : 0;
            if ($month < 1 || $month > 12 || ($day !== null && ($day < 1 || $day > 31))) {
                return null;
            }
            $precision = isset($m[6]) && $m[6] !== '' ? self::PRECISION_SECOND
                : (isset($m[5]) && $m[5] !== '' ? self::PRECISION_MINUTE
                : (isset($m[4]) && $m[4] !== '' ? self::PRECISION_MINUTE
                : ($day !== null ? self::PRECISION_DAY : self::PRECISION_MONTH)));
            return [
                'y' => $year, 'm' => $month, 'd' => $day ?? 1,
                'h' => $hour, 'mi' => $min, 's' => $sec,
            ];
        }

        // Space-separated year month day: "2026 08 15" (also "2026 08 15 19:30",
        // and "2026 08" for year+month).
        if (preg_match('~^(-?\d+)\s+(\d{1,2})(?:\s+(\d{1,2}))?(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$~', $text, $m)) {
            $year = (int) $m[1];
            $month = (int) $m[2];
            $day = isset($m[3]) && $m[3] !== '' ? (int) $m[3] : null;
            $hour = isset($m[4]) && $m[4] !== '' ? (int) $m[4] : 0;
            $min = isset($m[5]) && $m[5] !== '' ? (int) $m[5] : 0;
            $sec = isset($m[6]) && $m[6] !== '' ? (int) $m[6] : 0;
            if ($month < 1 || $month > 12 || ($day !== null && ($day < 1 || $day > 31))) {
                return null;
            }
            $precision = isset($m[6]) && $m[6] !== '' ? self::PRECISION_SECOND
                : (isset($m[5]) && $m[5] !== '' ? self::PRECISION_MINUTE
                : (isset($m[4]) && $m[4] !== '' ? self::PRECISION_MINUTE
                : ($day !== null ? self::PRECISION_DAY : self::PRECISION_MONTH)));
            return [
                'y' => $year, 'm' => $month, 'd' => $day ?? 1,
                'h' => $hour, 'mi' => $min, 's' => $sec,
            ];
        }

        // Pure digit string: YYYY[MM[DD[HH[MM[SS]]]]]
        if (preg_match('/^(-?\d+)$/', $text, $m)) {
            $sign = str_starts_with($m[1], '-') ? '-' : '';
            $digits = ltrim($m[1], '-');
            $len = strlen($digits);
            if ($len < 1 || $len > 14) {
                return null;
            }
            // A 5–14-digit string that does not read as a valid YYYYMMDD… pattern
            // is a huge year (e.g. "13800000000000" = 13.8 trillion BC), NOT a
            // 4-digit year followed by time groups. Huge years are year-precision.
            if ($len > 4) {
                $mo = (int) substr($digits, 4, 2);
                $day = $len > 6 ? (int) substr($digits, 6, 2) : 1;
                if ($mo < 1 || $mo > 12 || $day < 1 || $day > 31) {
                    $precision = self::PRECISION_YEAR;
                    return [
                        'y' => (int) ($sign . $digits), 'm' => 1, 'd' => 1,
                        'h' => 0, 'mi' => 0, 's' => 0,
                    ];
                }
            }
            $parts = self::splitDigitDate($digits);
            $precision = $parts['precision'];
            return [
                'y' => (int) ($sign . $parts['y']), 'm' => (int) $parts['mo'], 'd' => (int) $parts['d'],
                'h' => (int) $parts['h'], 'mi' => (int) $parts['mi'], 's' => (int) $parts['s'],
            ];
        }

        return null;
    }

    /**
     * Split a digit date string (no sign) into y/mo/d/h/mi/s plus precision.
     * Assumes a 4-digit year followed by up to five 2-digit groups
     * (MM DD HH MM SS). Longer strings are treated as huge-year-only.
     */
    private static function splitDigitDate(string $digits): array
    {
        $len = strlen($digits);
        if ($len <= 4) {
            return ['y' => $digits, 'mo' => '01', 'd' => '01', 'h' => '0', 'mi' => '0', 's' => '0', 'precision' => self::PRECISION_YEAR];
        }
        if ($len > 14) {
            return ['y' => $digits, 'mo' => '01', 'd' => '01', 'h' => '0', 'mi' => '0', 's' => '0', 'precision' => self::PRECISION_YEAR];
        }
        $year = substr($digits, 0, 4);
        $rest = substr($digits, 4);
        $g = [];
        for ($i = 0; $i < 5; $i++) {
            $g[$i] = strlen($rest) >= ($i + 1) * 2 ? substr($rest, $i * 2, 2) : '';
        }
        $n = intdiv(strlen($rest) + 1, 2); // number of complete 2-digit groups
        $precision = match ($n) {
            1 => self::PRECISION_MONTH,
            2 => self::PRECISION_DAY,
            3, 4 => self::PRECISION_MINUTE,
            default => self::PRECISION_SECOND,
        };
        return [
            'y' => $year, 'mo' => $g[0] !== '' ? $g[0] : '01', 'd' => $g[1] !== '' ? $g[1] : '01',
            'h' => $g[2] !== '' ? $g[2] : '0', 'mi' => $g[3] !== '' ? $g[3] : '0', 's' => $g[4] !== '' ? $g[4] : '0',
            'precision' => $precision,
        ];
    }

    /**
     * Infer the finest precision encoded in a stored canonical value
     * (e.g. '2026081112' → minute, '15000101000000' → second).
     * Mirrors splitDigitDate's precision rules. Used when the meta has no
     * precision (legacy data stored before the meta columns existed).
     */
    public static function precisionFromValue(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $bc = str_starts_with($value, '-');
        $digits = ltrim($value, '-');
        $len = strlen($digits);
        // Canonical values (≥ 11 digits: variable year + 10-digit tail) are
        // always padded to seconds, so the finest precision actually encoded
        // is inferred from the trailing groups: a day-precision date has a
        // 000000 time tail, a month one has day=01, a year one day=01+month=01.
        // BC dates store an inverted clock, so un-invert before inspecting.
        if ($len >= 11) {
            $tail = substr($digits, -10);
            $m = (int) substr($tail, 0, 2);
            $d = (int) substr($tail, 2, 2);
            $h = (int) substr($tail, 4, 2);
            $mi = (int) substr($tail, 6, 2);
            $s = (int) substr($tail, 8, 2);
            if ($bc) {
                $h = 23 - $h;
                $mi = 59 - $mi;
                $s = 59 - $s;
            }
            // Malformed legacy values (invalid time parts) infer as coarser.
            if ($m < 1 || $m > 12) { $m = 1; }
            if ($d < 1 || $d > 31) { $d = 1; }
            if ($h < 0 || $h > 23) { $h = 0; }
            if ($mi < 0 || $mi > 59) { $mi = 0; }
            if ($s < 0 || $s > 59) { $s = 0; }
            if ($s !== 0) {
                return self::PRECISION_SECOND;
            }
            if ($mi !== 0 || $h !== 0) {
                return self::PRECISION_MINUTE;
            }
            if ($d !== 1) {
                return self::PRECISION_DAY;
            }
            if ($m !== 1) {
                return self::PRECISION_MONTH;
            }
            return self::PRECISION_YEAR;
        }
        if ($len <= 4) {
            return self::PRECISION_YEAR;
        }
        $n = intdiv(strlen(substr($digits, 4)) + 1, 2);
        return match ($n) {
            1 => self::PRECISION_MONTH,
            2 => self::PRECISION_DAY,
            3, 4 => self::PRECISION_MINUTE,
            default => self::PRECISION_SECOND,
        };
    }

    /**
     * Build the canonical padded digit string from era-calendar components.
     */
    private static function canonicalFromComponents(int $y, int $m, int $d, int $h, int $mi, int $s, string $era): ?string
    {
        if ($era !== Era::GREGORIAN) {
            $conv = Era::toCanonical($era, $y, $m, $d);
            $y = $conv['year'];
            $m = $conv['month'];
            $d = $conv['day'];
        }
        $dateStr = sprintf('%04d-%02d-%02d %02d:%02d:%02d', $y, $m, $d, $h, $mi, $s);
        try {
            // UTC: flexible dates are stored without a timezone shift so the
            // canonical value is exactly the entered date (deterministic math).
            return Everything::dateToDb($dateStr, 'UTC');
        } catch (\Throwable) {
            return null;
        }
    }

    private static function maxPrecision(?string $a, ?string $b): string
    {
        $rank = array_flip(self::PRECISIONS);
        $ra = $a !== null ? ($rank[$a] ?? 0) : 0;
        $rb = $b !== null ? ($rank[$b] ?? 0) : 0;
        return self::PRECISIONS[max($ra, $rb)];
    }

    // ─── Canonical value → components ───

    public static function componentsFromCanonical(?string $value): ?array
    {
        if ($value === null || $value === '') {
            return null;
        }
        $digits = ltrim($value, '-');
        $bc = str_starts_with($value, '-');
        if (strlen($digits) >= 11) {
            // Canonical encoding (the engine's own read-back rule): a variable-
            // length year followed by an EXACTLY 10-digit MMDDHHMMSS tail. The
            // year is everything except the last 10 digits, so a year-1 date
            // stored as `10101000000` (leading zeros stripped by the numeric
            // column) parses back to year 1, not year 1010.
            $yearLen = strlen($digits) - 10;
            $year = (int) substr($digits, 0, $yearLen);
            $rest = substr($digits, -10);
            $m = (int) substr($rest, 0, 2);
            $d = (int) substr($rest, 2, 2);
            $h = (int) substr($rest, 4, 2);
            $mi = (int) substr($rest, 6, 2);
            $s = (int) substr($rest, 8, 2);
            if ($bc) {
                $h = 23 - $h;
                $mi = 59 - $mi;
                $s = 59 - $s;
            }
            // Guard against malformed legacy canonicals (e.g. a huge BC year
            // stored with an invalid 24:60:60 tail): clamp out-of-range parts.
            if ($m < 1 || $m > 12) { $m = 1; }
            if ($d < 1 || $d > 31) { $d = 1; }
            if ($h < 0 || $h > 23) { $h = 0; }
            if ($mi < 0 || $mi > 59) { $mi = 0; }
            if ($s < 0 || $s > 59) { $s = 0; }
            return [
                'y' => $bc ? -$year : $year,
                'm' => $m, 'd' => $d,
                'h' => $h, 'mi' => $mi, 's' => $s,
            ];
        }
        // Legacy unpadded values (e.g. '2026081112' = 2026-08-11 12:00) are a
        // 4-digit year followed by 2-digit groups. None should remain after
        // the backfill migration; kept as a defensive fallback.
        $parts = self::splitDigitDate($digits);
        $m = (int) $parts['mo'];
        $d = (int) $parts['d'];
        $h = (int) $parts['h'];
        $mi = (int) $parts['mi'];
        $s = (int) $parts['s'];
        if ($bc) {
            $h = 23 - $h;
            $mi = 59 - $mi;
            $s = 59 - $s;
        }
        if ($m < 1 || $m > 12) { $m = 1; }
        if ($d < 1 || $d > 31) { $d = 1; }
        if ($h < 0 || $h > 23) { $h = 0; }
        if ($mi < 0 || $mi > 59) { $mi = 0; }
        if ($s < 0 || $s > 59) { $s = 0; }
        return [
            'y' => (int) ($bc ? '-' . $parts['y'] : $parts['y']),
            'm' => $m, 'd' => $d,
            'h' => $h, 'mi' => $mi, 's' => $s,
        ];
    }

    /**
     * Re-encode a stored canonical into its canonical padded form, fixing any
     * malformed parts (e.g. a huge BC year stored with an invalid 24:60:60
     * tail). Returns the corrected value, or the input unchanged if already
     * canonical / unparseable. Idempotent.
     */
    public static function sanitizeCanonical(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return $value;
        }
        $c = self::componentsFromCanonical($value);
        if ($c === null) {
            return $value;
        }
        $reencoded = self::canonicalFromComponents($c['y'], $c['m'], $c['d'], $c['h'], $c['mi'], $c['s'], Era::GREGORIAN);
        return $reencoded ?? $value;
    }

    // ─── Bounds → start/end columns + meta ───

    /**
     * Map this flexible date onto the start/end columns and its meta.
     *
     * $side determines which column is the "primary" one:
     *  - 'start': exact/approx/after -> start = value; before -> end = value
     *    (start open); between/alternatives -> start + end.
     *  - 'end':   exact/approx/before -> end = value; after -> start = value
     *    (end open); between/alternatives -> start + end.
     *
     * @return array{start: ?string, end: ?string, meta: array}
     */
    public function toDb(string $side = 'start'): array
    {
        $start = null;
        $end = null;
        switch ($this->qualifier) {
            case self::QUALIFIER_UNKNOWN:
                break;
            case self::QUALIFIER_BEFORE:
                if ($side === 'start') {
                    $end = $this->value;
                } else {
                    $end = $this->value;
                }
                break;
            case self::QUALIFIER_AFTER:
                if ($side === 'start') {
                    $start = $this->value;
                } else {
                    $start = $this->value;
                }
                break;
            case self::QUALIFIER_BETWEEN:
                $start = $this->value;
                $end = $this->endValue;
                break;
            case self::QUALIFIER_ALTERNATIVES:
                $start = $this->value;
                $end = $this->endValue;
                break;
            default: // exact / approx
                if ($side === 'start') {
                    $start = $this->value;
                } else {
                    $end = $this->value;
                }
                break;
        }
        return ['start' => $start, 'end' => $end, 'meta' => $this->toArray()];
    }

    // ─── Display ───

    public function format(): string
    {
        $meta = $this->toArray();
        switch ($this->qualifier) {
            case self::QUALIFIER_BEFORE:
                return self::formatPair(null, $this->value, $meta, $meta);
            case self::QUALIFIER_AFTER:
                return self::formatPair($this->value, null, $meta, $meta);
            default:
                return self::formatPair($this->value, $this->endValue, $meta, $meta);
        }
    }

    /**
     * Format one canonical value honoring precision + era.
     * Uses an English, machine-readable form that the UI localizes.
     */
    public static function formatBound(?string $value, ?array $meta): string
    {
        if ($value === null || $value === '') {
            return '';
        }
        $c = self::componentsFromCanonical($value);
        if ($c === null) {
            return $value;
        }
        $precision = $meta['precision'] ?? self::precisionFromValue($value) ?? self::PRECISION_DAY;
        $era = $meta['era'] ?? Era::GREGORIAN;

        $y = $c['y'];
        $m = $c['m'];
        $d = $c['d'];
        $eraSuffix = '';
        if ($era !== Era::GREGORIAN && !($meta['degrade'] ?? false)) {
            $conv = Era::fromCanonical($era, $y, $m, $d);
            $y = $conv['year'];
            $m = $conv['month'];
            $d = $conv['day'];
            $eraSuffix = ' (' . $era . ')';
        }
        $bc = $y < 0;
        $abs = abs($y);

        switch ($precision) {
            case self::PRECISION_YEAR:
                $s = (string) ($bc ? $abs . ' BC' : $abs);
                break;
            case self::PRECISION_MONTH:
                $s = sprintf('%s-%02d', $bc ? '-' . $abs : $abs, $m);
                break;
            case self::PRECISION_MINUTE:
                $s = sprintf('%s-%02d-%02d %02d:%02d', $bc ? '-' . $abs : $abs, $m, $d, $c['h'], $c['mi']);
                break;
            case self::PRECISION_SECOND:
                $s = sprintf('%s-%02d-%02d %02d:%02d:%02d', $bc ? '-' . $abs : $abs, $m, $d, $c['h'], $c['mi'], $c['s']);
                break;
            default:
                $s = sprintf('%s-%02d-%02d', $bc ? '-' . $abs : $abs, $m, $d);
                break;
        }
        $fuzz = self::formatFuzz($meta['fuzz'] ?? null);
        return $s . $eraSuffix . ($fuzz !== '' ? ' ' . $fuzz : '');
    }

    /**
     * Format a stored pair (start/end columns + their meta) as a human string.
     * The start meta is treated as the primary descriptor.
     */
    public static function formatPair(?string $start, ?string $end, ?array $startMeta, ?array $endMeta = null): string
    {
        $sm = is_array($startMeta) ? $startMeta : [];
        $em = is_array($endMeta) ? $endMeta : [];
        $qualifier = $sm['qualifier'] ?? $em['qualifier'] ?? self::QUALIFIER_EXACT;

        if ($qualifier === self::QUALIFIER_BETWEEN && $start !== null && $end !== null) {
            return 'between ' . self::formatBound($start, $sm) . ' and ' . self::formatBound($end, $sm);
        }
        if ($qualifier === self::QUALIFIER_ALTERNATIVES) {
            $alts = $sm['alternatives'] ?? [];
            $fmt = array_map(static fn ($a) => self::formatBound((string) $a, $sm), $alts);
            return implode(' or ', $fmt);
        }
        if ($qualifier === self::QUALIFIER_BEFORE && $end !== null) {
            return 'before ' . self::formatBound($end, $em ?: $sm);
        }
        if ($qualifier === self::QUALIFIER_AFTER && $start !== null) {
            return 'after ' . self::formatBound($start, $sm);
        }
        if ($qualifier === self::QUALIFIER_UNKNOWN) {
            return 'unknown';
        }

        $s = $start !== null ? self::formatBound($start, $sm) : '';
        $e = $end !== null ? self::formatBound($end, $em) : '';
        if ($s !== '' && $e !== '') {
            // Identical bounds (e.g. a single exact date in both columns) have
            // nothing to compare — show the date once.
            if ($s === $e) {
                return $s;
            }
            return $s . ' — ' . $e;
        }
        if ($qualifier === self::QUALIFIER_APPROX) {
            return $s !== '' ? 'circa ' . $s : 'circa ' . $e;
        }
        return $s !== '' ? $s : $e;
    }
}
