<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ImportMysqlDump extends Command
{
    protected $signature = 'db:import-mysql-dump
        {file : Path to the .sql dump file (relative to container)}
        {--truncate : Truncate target tables before importing}
        {--dry-run : Parse and report INSERT counts without executing}';

    protected $description = 'Stream MySQL dump into PostgreSQL (memory efficient)';

    private const SKIP_TABLES = [
        'migrations', 'failed_jobs', 'telescope_entries', 'telescope_entries_tags',
        'telescope_monitoring', 'password_resets', 'personal_access_tokens',
    ];

    public function handle(): int
    {
        $filePath = $this->argument('file');
        if (!file_exists($filePath)) {
            $this->error("File not found: {$filePath}");
            return 1;
        }

        $this->info("Streaming dump: {$filePath}");

        // Open file handle with automatic UTF-16 detection
        $handle = fopen($filePath, 'rb');
        if (!$handle) {
            $this->error("Cannot open file");
            return 1;
        }

        // Detect BOM for UTF-16
        $bom = fread($handle, 2);
        if ($bom === "\xFF\xFE") {
            $this->info("Detected UTF-16LE → adding conversion filter");
            stream_filter_append($handle, 'convert.iconv.UTF-16LE/UTF-8');
        } elseif ($bom === "\xFE\xFF") {
            $this->info("Detected UTF-16BE → adding conversion filter");
            stream_filter_append($handle, 'convert.iconv.UTF-16BE/UTF-8');
        } else {
            rewind($handle);
        }

        $insertCount = 0;
        $currentSql = '';
        $tableInserts = [];

        // Read line by line
        while (($line = fgets($handle)) !== false) {
            $currentSql .= $line;
            // Check if we have a complete statement (ends with semicolon)
            if (preg_match('/;\s*$/', trim($line))) {
                $stmt = trim($currentSql);
                if (str_starts_with(strtoupper($stmt), 'INSERT')) {
                    // Convert backticks to double quotes
                    $stmt = preg_replace('/`([^`]+)`/', '"$1"', $stmt);
                    if (preg_match('/INSERT\s+INTO\s+"([^"]+)"/i', $stmt, $m)) {
                        $table = $m[1];
                        if (!in_array($table, self::SKIP_TABLES, true)) {
                            $tableInserts[$table][] = $stmt;
                            $insertCount++;
                        }
                    }
                }
                $currentSql = '';
            }
        }
        fclose($handle);

        $this->info("Found {$insertCount} INSERT statements across " . count($tableInserts) . " tables.");

        if ($this->option('dry-run')) {
            foreach ($tableInserts as $table => $stmts) {
                $this->line("  {$table}: " . count($stmts));
            }
            return 0;
        }

        // Disable FK constraints
        DB::statement('SET session_replication_role = replica;');

        try {
            DB::transaction(function () use ($tableInserts) {
                foreach ($tableInserts as $table => $stmts) {
                    if ($this->option('truncate')) {
                        $this->line("Truncating {$table}");
                        DB::statement("TRUNCATE TABLE \"{$table}\" CASCADE");
                    }
                    $this->info("Importing {$table} (" . count($stmts) . " rows)");
                    foreach ($stmts as $sql) {
                        DB::statement($sql);
                    }
                }
            });
        } finally {
            DB::statement('SET session_replication_role = DEFAULT;');
        }

        $this->info("Import complete.");
        return 0;
    }
}
