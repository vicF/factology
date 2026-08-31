<?php

namespace App\Services\Importer;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Find HUMAN things imported from GEDCOM files that are likely the same
 * person, and create DUPLICATE_OF links between them.
 *
 * Matching heuristic (conservative — false positives are worse than
 * false negatives):
 *   1. Normalized name match (case-insensitive, ignores surname slashes)
 *   2. Same sex
 *   3. Birth year within 2 years (or both without birth year)
 */
class DuplicatePersonMatcher
{
    /**
     * @return array{links_created: int, skipped: int, matches: array}
     */
    public function findDuplicates(?string $ownerId = null, bool $dryRun = false): array
    {
        $query = DB::table('things')
            ->join('links', function ($join) {
                $join->on('things.thing_id', '=', 'links.one_thing_id')
                     ->where('links.link_type_id', '=', UUID::LINK_TO_CLASS)
                     ->where('links.other_thing_id', '=', UUID::HUMAN);
            })
            ->where('things.deleted', false)
            // Only include things that have an IMPORTED_FROM link (GEDCOM imports)
            ->whereExists(function ($q) {
                $q->select(DB::raw(1))
                  ->from('links as l2')
                  ->whereColumn('l2.one_thing_id', 'things.thing_id')
                  ->where('l2.link_type_id', UUID::IMPORTED_FROM);
            })
            ->select('things.thing_id', 'things.name', 'things.data', 'things.start', 'things.owner');

        if ($ownerId) {
            $query->where('things.owner', $ownerId);
        }

        $persons = $query->get();

        $records = [];
        foreach ($persons as $p) {
            $props = [];
            if (is_string($p->data)) {
                $decoded = json_decode($p->data, true);
                $props = $decoded['properties'] ?? [];
            } elseif (is_object($p->data)) {
                $props = (array) ($p->data->properties ?? []);
            }

            $birthYear = null;
            if ($p->start !== null) {
                $birthYear = (int) substr((string) $p->start, 0, 4);
            }

            $records[] = [
                'thing_id'   => $p->thing_id,
                'owner'      => $p->owner,
                'name'       => self::normalizeName($p->name),
                'sex'        => $props['sex'] ?? null,
                'birth_year' => $birthYear,
            ];
        }

        $groups = [];
        foreach ($records as $r) {
            $key = mb_strtolower($r['name'] . '|' . ($r['sex'] ?? ''));
            $groups[$key][] = $r;
        }

        $linksCreated = 0;
        $skipped = 0;
        $matches = [];

        foreach ($groups as $group) {
            if (count($group) < 2) {
                continue;
            }

            $count = count($group);
            for ($i = 0; $i < $count; $i++) {
                for ($j = $i + 1; $j < $count; $j++) {
                    $a = $group[$i];
                    $b = $group[$j];

                    // Skip same-file namesakes (two people with the same name
                    // in one file are almost certainly distinct).
                    if ($a['owner'] === $b['owner']
                        && $this->sourceFileOf($a['thing_id']) === $this->sourceFileOf($b['thing_id'])) {
                        $skipped++;
                        continue;
                    }

                    // Birth year check: within 2 years or both absent.
                    $byA = $a['birth_year'];
                    $byB = $b['birth_year'];
                    if ($byA !== null && $byB !== null && abs((int) $byA - (int) $byB) > 2) {
                        $skipped++;
                        continue;
                    }

                    // Skip if DUPLICATE_OF link already exists.
                    $existing = DB::table('links')
                        ->where('link_type_id', UUID::DUPLICATE_OF)
                        ->where(function ($q) use ($a, $b) {
                            $q->where('one_thing_id', $a['thing_id'])
                              ->where('other_thing_id', $b['thing_id'])
                              ->orWhere(function ($q) use ($a, $b) {
                                  $q->where('one_thing_id', $b['thing_id'])
                                    ->where('other_thing_id', $a['thing_id']);
                              });
                        })
                        ->first();

                    if ($existing) {
                        $skipped++;
                        continue;
                    }

                    $matches[] = [
                        'thing_id_a' => $a['thing_id'],
                        'name_a'     => $a['name'],
                        'thing_id_b' => $b['thing_id'],
                        'name_b'     => $b['name'],
                    ];

                    if (!$dryRun) {
                        DB::table('links')->insert([
                            'link_uuid'      => (string) Str::uuid(),
                            'one_thing_id'   => $a['thing_id'],
                            'link_type_id'   => UUID::DUPLICATE_OF,
                            'other_thing_id' => $b['thing_id'],
                            'public'         => false,
                        ]);
                    }
                    $linksCreated++;
                }
            }
        }

        return [
            'links_created' => $linksCreated,
            'skipped'       => $skipped,
            'matches'       => $matches,
        ];
    }

    /**
     * Return the fileKey portion of the source_external_id stored in the
     * IMPORTED_FROM link's data ({fileKey}/{@id}).
     */
    private function sourceFileOf(string $thingId): ?string
    {
        $link = DB::table('links')
            ->where('one_thing_id', $thingId)
            ->where('link_type_id', UUID::IMPORTED_FROM)
            ->first();

        if (!$link || !$link->data) {
            return null;
        }

        $linkData = is_string($link->data) ? json_decode($link->data, true) : (array) $link->data;
        $externalId = $linkData['source_external_id'] ?? null;

        if (!$externalId) {
            return null;
        }

        $parts = explode('/', $externalId, 2);
        return $parts[0] ?? null;
    }

    /**
     * Normalize a GEDCOM name for comparison.
     * "John /Smith/" → "John Smith" — strips GEDCOM surname markers.
     */
    public static function normalizeName(string $name): string
    {
        $name = preg_replace('#/#u', '', $name);
        $name = preg_replace('/\s+/u', ' ', $name);
        return trim($name);
    }
}