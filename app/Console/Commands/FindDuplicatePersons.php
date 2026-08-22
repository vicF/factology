<?php

namespace App\Console\Commands;

use Fokin\Facts\Data\UUID;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Find HUMAN things imported from GEDCOM files that are likely the same
 * person, and create DUPLICATE_OF links between them.
 *
 * Matching heuristic (conservative — false positives are worse than
 * false negatives):
 *   1. Normalized name match (case-insensitive, ignores surname slashes)
 *   2. Same sex
 *   3. Birth year within 2 years (or both without birth year)
 *
 * Created links are real DUPLICATE_OF links (not suggestions). The user
 * can review and delete false positives in the UI.
 */
class FindDuplicatePersons extends Command
{
    protected $signature = 'factology:find-duplicates
                            {--owner= : Only scan things owned by this UUID}
                            {--dry-run : Report matches without creating links}';

    protected $description = 'Find duplicate HUMAN things and link them with DUPLICATE_OF';

    public function handle(): int
    {
        $ownerFilter = $this->option('owner');
        $dryRun = $this->option('dry-run');

        // 1. Fetch all HUMAN things with source_service = 'gedcom'
        $query = DB::table('things')
            ->join('links', function ($join) {
                $join->on('things.thing_id', '=', 'links.one_thing_id')
                     ->where('links.link_type_id', '=', UUID::LINK_TO_CLASS)
                     ->where('links.other_thing_id', '=', UUID::HUMAN);
            })
            ->where('things.source_service', 'gedcom')
            ->where('things.deleted', false)
            ->select('things.thing_id', 'things.name', 'things.data', 'things.owner');

        if ($ownerFilter) {
            $query->where('things.owner', $ownerFilter);
        }

        $persons = $query->get();
        $this->info("Found {$persons->count()} imported persons");

        if ($persons->isEmpty()) {
            return self::SUCCESS;
        }

        // 2. Parse into normalized records
        $records = [];
        foreach ($persons as $p) {
            $props = [];
            if (is_string($p->data)) {
                $decoded = json_decode($p->data, true);
                $props = $decoded['properties'] ?? [];
            } elseif (is_object($p->data)) {
                $props = (array) ($p->data->properties ?? []);
            }

            $records[] = [
                'thing_id'   => $p->thing_id,
                'owner'      => $p->owner,
                'name'       => self::normalizeName($p->name),
                'sex'        => $props['sex'] ?? null,
                'birth_year' => $props['birth_year'] ?? null,
            ];
        }

        // 3. Group by normalized name (first pass) and match within groups
        $groups = [];
        foreach ($records as $r) {
            $key = mb_strtolower($r['name'] . '|' . ($r['sex'] ?? ''));
            $groups[$key][] = $r;
        }

        $linksCreated = 0;
        $skipped = 0;

        foreach ($groups as $key => $group) {
            if (count($group) < 2) {
                continue;
            }

            // Compare each pair within the group
            for ($i = 0; $i < count($group); $i++) {
                for ($j = $i + 1; $j < count($group); $j++) {
                    $a = $group[$i];
                    $b = $group[$j];

                    // Skip if same owner and same source (same file, different persons)
                    if ($a['owner'] === $b['owner']) {
                        // Check if they're from different source files
                        $aThing = DB::table('things')->where('thing_id', $a['thing_id'])->value('source_external_id');
                        $bThing = DB::table('things')->where('thing_id', $b['thing_id'])->value('source_external_id');
                        // source_external_id format: {fileKey}/{@id}
                        $aFile = explode('/', $aThing ?? '')[0] ?? '';
                        $bFile = explode('/', $bThing ?? '')[0] ?? '';
                        if ($aFile === $bFile) {
                            $skipped++;
                            continue; // Same file — likely different namesakes, not duplicates
                        }
                    }

                    // Birth year check: within 2 years or both absent
                    $byA = $a['birth_year'];
                    $byB = $b['birth_year'];
                    if ($byA !== null && $byB !== null && abs((int)$byA - (int)$byB) > 2) {
                        $skipped++;
                        continue;
                    }

                    // Check if DUPLICATE_OF link already exists
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

                    $this->line(sprintf(
                        '  Match: %s (%s) ↔ %s (%s)',
                        $a['thing_id'], $a['name'],
                        $b['thing_id'], $b['name']
                    ));

                    if (!$dryRun) {
                        DB::table('links')->insert([
                            'link_uuid'      => (string) \Illuminate\Support\Str::uuid(),
                            'one_thing_id'   => $a['thing_id'],
                            'link_type_id'   => UUID::DUPLICATE_OF,
                            'other_thing_id' => $b['thing_id'],
                            'public'         => false,
                        ]);
                        $linksCreated++;
                    } else {
                        $linksCreated++;
                    }
                }
            }
        }

        $this->info("Done: {$linksCreated} DUPLICATE_OF links " . ($dryRun ? 'found' : 'created') . ", {$skipped} skipped");

        return self::SUCCESS;
    }

    /**
     * Normalize a GEDCOM name for comparison.
     * "John /Smith/" → "John Smith"
     * "Иван /Петров/" → "Иван Петров"
     * Strips GEDCOM surname markers and extra whitespace.
     */
    private static function normalizeName(string $name): string
    {
        $name = preg_replace('#/#u', '', $name);
        $name = preg_replace('/\s+/u', ' ', $name);
        return trim($name);
    }
}