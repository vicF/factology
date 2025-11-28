<?php

declare(strict_types=1);

namespace Tests\Support\Helper;

// here you can define custom actions
// all public methods declared in helper class will be available in $I

class Acceptance extends \Codeception\Module
{
    public function _afterStep(\Codeception\Step $step)
    {
        $this->dumpBrowserConsole();
    }

    public function dumpBrowserConsole()
    {
        try {
            $wd = $this->getModule('WebDriver');
            $driver = $wd->webDriver;

            $logs = $driver->manage()->getLog('browser');

            if (empty($logs)) {
                return;
            }

            foreach ($logs as $log) {
                $level    = $log['level'] ?? 'INFO';
                $message  = $log['message'] ?? 'No message';
                $rawTs    = $log['timestamp'] ?? 0;

                // Fix for PHP 8.1+ strict types — timestamp can be float now
                $ts = is_float($rawTs) ? (int) floor($rawTs / 1000) : (int) ($rawTs / 1000);
                $time = date('H:i:s', $ts);

                $prefix = match (strtoupper($level)) {
                    'SEVERE'  => 'JS ERROR',
                    'WARNING' => 'JS WARNING',
                    default   => 'JS LOG',
                };

                $this->debugSection("$prefix $time", $message);

                if (strtoupper($level) === 'SEVERE') {
                    $this->fail("JavaScript error in browser console: $message");
                }
            }
        } catch (\Throwable $e) {
            $this->debug('Console logging skipped: ' . $e->getMessage());
        }
    }
}
