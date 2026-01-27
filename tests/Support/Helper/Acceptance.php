<?php

declare(strict_types=1);

namespace Tests\Support\Helper;

use Codeception\TestInterface;
use Codeception\Step;

class Acceptance extends \Codeception\Module
{
    private static int $lastLogPosition = 0;

    public function _beforeSuite($settings = [])
    {
        // Determine project root directory reliably in Codeception context
        $projectRoot = dirname(__DIR__, 3); // tests/_support/Helper -> tests/_support -> tests -> project root

        $logFile = $projectRoot . '/storage/logs/laravel.log';

        if (file_exists($logFile)) {
            // Start monitoring from the current end of the file
            // This ensures we only capture new entries written during this test run
            self::$lastLogPosition = filesize($logFile);
        } else {
            self::$lastLogPosition = 0;
        }
    }

    public function _afterStep(Step $step)
    {
        parent::_afterStep($step);
        $this->dumpBrowserConsole();
    }

    public function _failed(TestInterface $test, \Exception $fail)
    {
        parent::_failed($test, $fail);
        $this->dumpBrowserConsole();
        $this->dumpNewLaravelErrors();
    }

    public function _after(TestInterface $test)
    {
        // Show Laravel errors at the end of every test (passed or failed)
        $this->dumpNewLaravelErrors();
    }

    public function dumpBrowserConsole()
    {
        try {
            $driver = $this->getModule('WebDriver')->webDriver;
            $logs   = $driver->manage()->getLog('browser');

            if (empty($logs)) {
                return;
            }

            foreach ($logs as $log) {
                $level   = strtoupper($log['level'] ?? 'INFO');
                $message = $log['message'] ?? '';
                $rawTs   = $log['timestamp'] ?? 0;
                $ts      = is_float($rawTs) ? (int)floor($rawTs / 1000) : (int)($rawTs / 1000);
                $time    = date('H:i:s', $ts);

                $line = match ($level) {
                    'SEVERE'  => "JS ERROR   $time  $message",
                    'WARNING' => "JS WARNING $time  $message",
                    default   => "JS LOG     $time  $message",
                };

                // Direct ANSI codes – works everywhere, no dependencies
                $colored = match ($level) {
                    'SEVERE'  => "\033[1;31m$line\033[0m",   // bright red
                    'WARNING' => "\033[1;33m$line\033[0m",   // bright yellow
                    default   => "\033[36m$line\033[0m",     // cyan
                };

                // This is the ONLY method that exists and works in Codeception 5.3.2
                $this->debug($colored,false);
            }

            // Optional: fail only on real JS errors (skip 401/404 etc.)
            foreach ($logs as $log) {
                if (($log['level'] ?? '') === 'SEVERE'
                    && !str_contains($log['message'] ?? '', '401')
                    && !str_contains($log['message'] ?? '', '404')
                    && !str_contains($log['message'] ?? '', 'Failed to load resource')) {
                    $this->fail('JavaScript error: ' . $log['message']);
                }
            }

        } catch (\Throwable $e) {
            $this->debug("\033[90mConsole logging failed: {$e->getMessage()}\033[0m");
        }
    }

    /**
     * Dump only new Laravel log entries with ERROR, CRITICAL, ALERT or EMERGENCY level
     * that were appended to laravel.log since the last check (or suite start).
     */
    private function dumpNewLaravelErrors(): void
    {
        // Determine project root directory reliably in Codeception context
        $projectRoot = dirname(__DIR__, 3); // tests/_support/Helper -> tests/_support -> tests -> project root

        $logFile = $projectRoot . '/storage/logs/laravel.log';

        if (!file_exists($logFile)) {
            $this->debug("\033[33mLaravel log file not found: $logFile\033[0m");
            return;
        }

        $currentSize = filesize($logFile);

        if ($currentSize <= self::$lastLogPosition) {
            return; // no new content since last check
        }

        $handle = fopen($logFile, 'r');
        if ($handle === false) {
            $this->debug("\033[33mCould not open Laravel log file: $logFile\033[0m");
            return;
        }

        fseek($handle, self::$lastLogPosition);
        $newContent = '';
        while (!feof($handle)) {
            $newContent .= fread($handle, 8192);
        }
        fclose($handle);

        // Update position for next call
        self::$lastLogPosition = $currentSize;

        if (trim($newContent) === '') {
            return;
        }

        $lines = explode("\n", $newContent);
        $errorLines = [];
        foreach ($lines as $line) {
            //if (preg_match('/\.(ERROR|CRITICAL|ALERT|EMERGENCY):/', $line)) {
                $errorLines[] = $line;
            //}
        }

        if (empty($errorLines)) {
            return;
        }

        $this->debug("\n\033[1;31m=== New Laravel ERROR-level Log Entries ===\033[0m");
        //foreach ($errorLines as $line) {
            $this->debug($newContent, false);
        //}
        $this->debug("\033[1;31m=== End of New ERROR Logs ===\033[0m\n");
    }

    function debug($var, bool $trace =true): void
    {
        if (in_array('--debug', $_SERVER['argv'] ?? [], true) ||
            in_array('-v', $_SERVER['argv'] ?? [], true) ||
            defined('CODECEPTION_DEBUG') && CODECEPTION_DEBUG) {
            if($trace) {
                $bt = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 2)[1] ?? [];
                $file = $bt['file'] ?? 'unknown';
                $line = $bt['line'] ?? '?';
                fwrite(STDERR, "\n\033[0;36mDEBUG $file:$line\033[0m\n");
            }
            //foreach ($args as $var) {
                // If it's a string that likely already contains ANSI escape codes,
                // write it directly to preserve coloring
                if (is_string($var) && preg_match('/\033\[[0-9;]*m/', $var)) {
                    fwrite(STDERR, $var . "\n");
                } else {
                    if (class_exists('\\Symfony\\Component\\VarDumper\\VarDumper')) {
                        \Symfony\Component\VarDumper\VarDumper::dump($var);
                    } else {
                        var_dump($var);
                    }
               // }
            }

            //fwrite(STDERR, "\n");
        }
    }
}
