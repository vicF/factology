<?php

namespace App\Console\Commands;

use App\Services\Importer\DuplicatePersonMatcher;
use Illuminate\Console\Command;

/**
 * Find HUMAN things imported from GEDCOM files that are likely the same
 * person, and create DUPLICATE_OF links between them.
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

        $result = (new DuplicatePersonMatcher())->findDuplicates($ownerFilter, (bool) $dryRun);

        $this->info('Scanned imported persons and matched duplicates.');
        foreach ($result['matches'] as $match) {
            $this->line(sprintf(
                '  Match: %s (%s) ↔ %s (%s)',
                $match['thing_id_a'], $match['name_a'],
                $match['thing_id_b'], $match['name_b']
            ));
        }
        $this->info(sprintf(
            'Done: %d DUPLICATE_OF links %s, %d skipped',
            $result['links_created'],
            $dryRun ? 'found (dry run)' : 'created',
            $result['skipped']
        ));

        return self::SUCCESS;
    }
}