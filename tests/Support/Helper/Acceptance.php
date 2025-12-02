<?php

declare(strict_types=1);

namespace Tests\Support\Helper;

use Codeception\TestInterface;

class Acceptance extends \Codeception\Module
{
    public function _afterStep(\Codeception\Step $step)
    {
        parent::_afterStep($step);
        $this->dumpBrowserConsole();
    }

    public function _failed(TestInterface $test, \Exception $fail)
    {
        parent::_failed($test, $fail);
        $this->dumpBrowserConsole();
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
                $this->debug($colored);
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
}
