<?php

namespace App\Console\Commands;

use App\Services\DatabaseConsistencyChecker;
use Illuminate\Console\Command;

/**
 * Run the database consistency audit.
 *
 * Useful right after a data import or a manual database edit to surface
 * structural problems: dangling links, self-references, objects without a
 * class, classes detached from the hierarchy, and link types placed outside
 * the link taxonomy. Reports only — nothing is written.
 */
class CheckDatabaseConsistency extends Command
{
    protected $signature = 'factology:check-consistency
                            {--json : Print the full report as JSON}';

    protected $description = 'Check the database for consistency issues';

    public function handle(DatabaseConsistencyChecker $checker): int
    {
        $report = $checker->check();

        if ($this->option('json')) {
            $this->line(json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        } elseif ($report['clean']) {
            $this->info('Database is consistent. No issues found.');
        } else {
            $this->error('Consistency issues found:');
            foreach ($report['summary'] as $check => $count) {
                $this->line(sprintf('  %-32s %d', $check, $count));
            }
            $this->newLine();
            $this->line('Run with --json for the full issue details.');
        }

        return $report['clean'] ? 0 : 1;
    }
}
