<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class AnalyzeSlowLog extends Command
{
    protected $signature = 'log:analyze-slow
                            {--threshold=1000 : Minimum duration in milliseconds}
                            {--lines=500 : Number of log lines to scan}';

    protected $description = 'Parse the structured JSON log and display slow requests';

    public function handle(): int
    {
        $path = storage_path('logs/structured.json');
        if (!file_exists($path)) {
            $this->warn('structured.json log file not found at: ' . $path);
            $this->line('Make sure JSON_LOG_ENABLED=true and requests have been made.');
            return 0;
        }

        $threshold = (int) $this->option('threshold');
        $maxLines = (int) $this->option('lines');

        $lines = file($path);
        $lines = array_slice($lines, -$maxLines);

        $slow = [];

        foreach ($lines as $line) {
            $entry = json_decode(trim($line), true);
            if (!$entry || !isset($entry['duration'])) continue;

            $duration = (float) $entry['duration'];
            if ($duration < $threshold) continue;

            $slow[] = [
                'duration' => round($duration, 0) . 'ms',
                'method'   => $entry['method'] ?? '?',
                'url'      => $entry['url'] ?? '?',
                'status'   => $entry['status'] ?? '?',
                'time'     => $entry['time'] ?? ($entry['datetime'] ?? '?'),
            ];
        }

        if (empty($slow)) {
            $this->info("No requests found above {$threshold}ms threshold.");
            return 0;
        }

        usort($slow, fn($a, $b) => (int) $b['duration'] <=> (int) $a['duration']);

        $this->table(
            ['Duration', 'Method', 'Status', 'URL', 'Time'],
            array_slice($slow, 0, 50)
        );

        $this->line("\nTotal slow requests (>={$threshold}ms): " . count($slow));

        return 0;
    }
}
