<?php

namespace App\Services\Importer;

/**
 * Parse a GEDCOM 5.5.1 file into a structured record tree.
 *
 * GEDCOM is a line-oriented format:
 *   level [xref_id] TAG [value]
 *
 * Level 0 starts a new record (e.g. INDI, FAM, SOUR).
 * Higher levels are structured data (level 1 = event, level 2 = attributes).
 */
class GedcomParser
{
    /** @var array<int, array{id: string, tag: string, value: string, children: array}> */
    private array $records = [];

    /**
     * Parse raw GEDCOM text into an array of record trees.
     *
     * @return array<int, array{id: string, tag: string, value: string, children: array}>
     */
    public function parse(string $gedcom): array
    {
        $this->records = [];
        $lines = explode("\n", str_replace("\r\n", "\n", $gedcom));

        $stack = []; // tracks [level, node] for nesting
        $currentRecord = null;

        foreach ($lines as $rawLine) {
            $line = trim($rawLine);
            if ($line === '' || $line === '0 TRLR') {
                continue;
            }

            // Parse the line: level [xref_id] TAG [value]
            if (!preg_match('/^(\d+)\s*(@(\w+)@)?\s*(\w+)\s*(.*)$/s', $line, $m)) {
                continue;
            }

            $level = (int) $m[1];
            $xrefId = !empty($m[2]) ? $m[2] : null; // e.g. @I1@
            $tag = strtoupper($m[4]);
            $value = trim($m[5] ?? '');

            // Skip GEDCOM structural records (HEAD, SUBM, SUBN) — only data records
            if ($level === 0 && in_array($tag, ['HEAD', 'SUBM', 'SUBN'], true)) {
                continue;
            }

            $node = [
                'id' => $xrefId,
                'tag' => $tag,
                'value' => $value,
                'children' => [],
            ];

            if ($level === 0) {
                $this->records[] = &$node;
                $currentRecord = &$node;
                $stack = [0 => &$node];
            } else {
                // Find parent: walk down stack to the level just above
                $parentLevel = $level - 1;
                while (count($stack) > $parentLevel + 1) {
                    array_pop($stack);
                }
                if (isset($stack[$parentLevel])) {
                    $stack[$parentLevel]['children'][] = &$node;
                }
                $stack[$level] = &$node;
            }
            unset($node);
        }

        return $this->records;
    }

    /**
     * Find a child node by tag within a node's children.
     */
    public static function findChild(array $node, string $tag): ?array
    {
        foreach ($node['children'] as $child) {
            if ($child['tag'] === $tag) {
                return $child;
            }
        }
        return null;
    }

    /**
     * Find all children of a node with a given tag.
     */
    public static function findChildren(array $node, string $tag): array
    {
        return array_values(array_filter($node['children'], fn($c) => $c['tag'] === $tag));
    }

    /**
     * Get the value of a child tag, or null if not found.
     */
    public static function childValue(array $node, string $tag): ?string
    {
        $child = self::findChild($node, $tag);
        return $child['value'] ?? null;
    }

    /**
     * Get all values from a subtree: e.g. for CONT/CONC concatenation, or
     * multi-line values. Returns the concatenated value.
     */
    public static function getFullValue(array $node): string
    {
        $value = $node['value'];
        foreach ($node['children'] as $child) {
            if ($child['tag'] === 'CONT') {
                $value .= "\n" . $child['value'];
            } elseif ($child['tag'] === 'CONC') {
                $value .= $child['value'];
            }
        }
        return $value;
    }

    /**
     * Parse a GEDCOM date string into parts compatible with FlexibleDate::parse.
     *
     * GEDCOM dates: "DD MMM YYYY", optionally with qualifiers:
     *   ABT 1900 → about 1900
     *   BEF 12 APR 1856 → before 1856-04-12
     *   AFT 30 NOV 2000 → after 2000-11-30
     *   BET 1900 AND 1910 → between 1900 and 1910
     *   FROM 1900 TO 1910 → between 1900 and 1910
     *   EST 1900 → about 1900 (estimated)
     *   CAL 1900 → about 1900 (calculated)
     *   INT 1900 (phrase) → about 1900 (interpreted with comment)
     *
     * Returns a human-readable string that FlexibleDate::parse can handle.
     */
    public static function parseGedcomDate(?string $gedcomDate): ?string
    {
        if (empty($gedcomDate)) {
            return null;
        }

        $text = trim($gedcomDate);

        // Map GEDCOM qualifiers to human-readable forms
        $patterns = [
            '/^ABT\s+(.+)$/i' => 'about $1',
            '/^ABT\.\s+(.+)$/i' => 'about $1',
            '/^APPROXIMATELY\s+(.+)$/i' => 'about $1',
            '/^BEF\s+(.+)$/i' => 'before $1',
            '/^BEF\.\s+(.+)$/i' => 'before $1',
            '/^AFT\s+(.+)$/i' => 'after $1',
            '/^AFT\.\s+(.+)$/i' => 'after $1',
            '/^BET\s+(.+)\s+AND\s+(.+)$/i' => 'between $1 and $2',
            '/^BET\s+(.+)\s+-\s+(.+)$/i' => 'between $1 and $2',
            '/^FROM\s+(.+)\s+TO\s+(.+)$/i' => 'between $1 and $2',
            '/^EST\s+(.+)$/i' => 'about $1',
            '/^CAL\s+(.+)$/i' => 'about $1',
            '/^INT\s+(.+?)\s*\((.+)\)\s*$/i' => 'about $1 ($2)',
        ];

        foreach ($patterns as $regex => $replacement) {
            $result = preg_replace($regex, $replacement, $text, 1, $count);
            if ($count > 0) {
                return $result;
            }
        }

        // Check for date with phrase parenthetical: "12 APR 1856 (certain)"
        if (preg_match('/^(.+?)\s*\((.+)\)\s*$/', $text, $m)) {
            return trim($m[1]) . ' (' . trim($m[2]) . ')';
        }

        // Convert GEDCOM date format (DD MMM YYYY) to ISO-like format
        return self::convertGedcomDateToIso($text);
    }

    /**
     * Convert "DD MMM YYYY" to "YYYY-MM-DD" for FlexibleDate consumption.
     */
    private static function convertGedcomDateToIso(string $date): ?string
    {
        $months = [
            'JAN' => '01', 'FEB' => '02', 'MAR' => '03', 'APR' => '04',
            'MAY' => '05', 'JUN' => '06', 'JUL' => '07', 'AUG' => '08',
            'SEP' => '09', 'OCT' => '10', 'NOV' => '11', 'DEC' => '12',
        ];

        // Try DD MMM YYYY (day, month abbreviation, year)
        if (preg_match('/^(\d{1,2})\s+([A-Z]{3})\s+(-?\d{1,4})$/', $date, $m)) {
            $day = str_pad($m[1], 2, '0', STR_PAD_LEFT);
            $month = $months[strtoupper($m[2])] ?? null;
            $year = $m[3];
            if ($month !== null) {
                return sprintf('%s-%s-%s', $year, $month, $day);
            }
        }

        // Try MMM YYYY (month abbreviation, year — month precision)
        if (preg_match('/^([A-Z]{3})\s+(-?\d{1,4})$/', $date, $m)) {
            $month = $months[strtoupper($m[1])] ?? null;
            $year = $m[2];
            if ($month !== null) {
                return sprintf('%s-%s', $year, $month);
            }
        }

        // Try YYYY (just a year)
        if (preg_match('/^(-?\d{1,4})$/', $date, $m)) {
            return $m[1];
        }

        // Try DD MON YYYY (Russian-style month abbreviations)
        $russianMonths = [
            'ЯНВ' => '01', 'ФЕВ' => '02', 'МАР' => '03', 'АПР' => '04',
            'МАЙ' => '05', 'ИЮН' => '06', 'ИЮЛ' => '07', 'АВГ' => '08',
            'СЕН' => '09', 'ОКТ' => '10', 'НОЯ' => '11', 'ДЕК' => '12',
        ];
        if (preg_match('/^(\d{1,2})\s+([А-ЯЁ]{3})\s+(-?\d{1,4})$/', $date, $m)) {
            $day = str_pad($m[1], 2, '0', STR_PAD_LEFT);
            $month = $russianMonths[strtoupper($m[2])] ?? null;
            $year = $m[3];
            if ($month !== null) {
                return sprintf('%s-%s-%s', $year, $month, $day);
            }
        }

        // Return as-is if nothing matches — FlexibleDate::parse may still handle it
        return $date;
    }

    /**
     * Extract place name from a PLAC node, handling hierarchy.
     * GEDCOM places can be "City, County, State, Country" or have
     * hierarchical sub-tags.
     */
    public static function extractPlaceName(array $node): string
    {
        if ($node['tag'] !== 'PLAC') {
            return '';
        }
        $value = trim($node['value']);

        // If there's a hierarchical place structure (level 2+ tags), prefer
        // the most specific name (usually the first comma-separated part)
        $hier = self::findChild($node, 'MAP');
        if ($hier !== null) {
            // MAP latitude/longitude — not a place name, skip
        }

        // Return just the first part (most specific) for the name
        $parts = explode(',', $value);
        return trim($parts[0] ?: $value);
    }

    /**
     * Extract coordinates from a PLAC node (MAP Lati/Long).
     * @return array{lat: ?float, lng: ?float}|null
     */
    public static function extractPlaceCoordinates(array $node): ?array
    {
        $map = self::findChild($node, 'MAP');
        if ($map === null) {
            return null;
        }
        $lat = self::childValue($map, 'LATI');
        $lng = self::childValue($map, 'LONG');

        if ($lat === null || $lng === null) {
            return null;
        }

        // Parse N/S/E/W format: "N49.12345" or "49.12345" or "49.12345N"
        $latVal = self::parseCoordinate($lat, ['N', 'S']);
        $lngVal = self::parseCoordinate($lng, ['E', 'W']);

        if ($latVal === null || $lngVal === null) {
            return null;
        }

        return ['lat' => $latVal, 'lng' => $lngVal];
    }

    private static function parseCoordinate(string $value, array $directions): ?float
    {
        $value = trim(strtoupper($value));
        $sign = 1.0;

        // Direction suffix: "49.12345N"
        if (in_array(substr($value, -1), $directions, true)) {
            $dir = substr($value, -1);
            $value = substr($value, 0, -1);
            if ($dir === $directions[1]) { // S or W
                $sign = -1.0;
            }
        }
        // Direction prefix: "N49.12345"
        elseif (in_array(substr($value, 0, 1), $directions, true)) {
            $dir = substr($value, 0, 1);
            $value = substr($value, 1);
            if ($dir === $directions[1]) { // S or W
                $sign = -1.0;
            }
        }

        $val = (float) $value;
        return $val * $sign;
    }
}