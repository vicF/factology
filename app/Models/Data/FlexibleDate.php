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
        return $d;
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

        // ISO: Y-M-D[ H:i[:s]] (also "Y-M")
        if (preg_match('/^(-?\d+)-(\d{1,2})(?:-(\d{1,2}))?(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/', $text, $m)) {
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
        $formatted = Everything::dateFromDb($value, 'UTC', 'Y-m-d H:i:s');
        if (!is_string($formatted)) {
            return null;
        }
        if (!preg_match('/^(-)?(\d+)-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/', $formatted, $m)) {
            return null;
        }
        $year = (int) ($m[1] . $m[2]);
        return [
            'y' => $year, 'm' => (int) $m[3], 'd' => (int) $m[4],
            'h' => (int) $m[5], 'mi' => (int) $m[6], 's' => (int) $m[7],
        ];
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
        $precision = $meta['precision'] ?? self::PRECISION_DAY;
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
        return $s . $eraSuffix;
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
            return $s . ' — ' . $e;
        }
        if ($qualifier === self::QUALIFIER_APPROX) {
            return $s !== '' ? 'circa ' . $s : 'circa ' . $e;
        }
        return $s !== '' ? $s : $e;
    }
}
