<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    protected function setUp(): void
    {
        $this->preventUsageOfOriginalRefreshDatabase();

        parent::setUp();

        // Enable console logging only when Codeception is run with --debug
        if (in_array('--debug', $_SERVER['argv'] ?? [], true)) {
            // Get current stack channels safely (avoid calling closure directly)
            $currentChannels = config('logging.channels.stack.channels');

            // If it's a closure (from config file), evaluate it once to get the array
            if ($currentChannels instanceof Closure) {
                $currentChannels = $currentChannels();
            }

            // Ensure it's an array (fallback to ['single'] if something went wrong)
            if (!is_array($currentChannels)) {
                $currentChannels = ['single'];
            }

            // Add 'test_debug' if not already present
            if (!in_array('test_debug', $currentChannels, true)) {
                $currentChannels[] = 'test_debug';
            }

            config([
                'logging.default' => 'stack',
                'logging.channels.stack.channels' => $currentChannels,
                // Optional: enforce debug level for this channel during tests
                'logging.channels.test_debug.level' => 'debug',
            ]);
        }
    }

    /**
     * Throw exception if someone used the original RefreshDatabase trait.
     * Forces developers to use SafeRefreshDatabase instead.
     */
    private function preventUsageOfOriginalRefreshDatabase(): void
    {
        // class_uses() returns traits used directly by this class (not inherited)
        $usedTraits = class_uses($this, false);

        $forbiddenTrait = \Illuminate\Foundation\Testing\RefreshDatabase::class;

        if (isset($usedTraits[$forbiddenTrait])) {
            throw new \RuntimeException(
                "Forbidden: The original Illuminate\Foundation\Testing\RefreshDatabase trait " .
                "is used in " . static::class . ".\n\n" .
                "This can lead to destructive operations on the wrong database!\n\n" .
                "→ Replace it with Tests\Traits\SafeRefreshDatabase\n" .
                "→ Example:\n" .
                "    use Tests\Traits\SafeRefreshDatabase;\n\n" .
                "The safe version includes a guard that prevents running on non-test databases."
            );
        }
    }
}
