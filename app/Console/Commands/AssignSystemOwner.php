<?php

namespace App\Console\Commands;

use Fokin\Facts\Data\UUID;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Rollout helper: mark all public classes as system-owned.
 *
 * Runs once (or as needed) in the dev database before regenerating
 * database/system-objects.json. Individual objects can additionally be
 * marked system-owned by an admin via the object edit form.
 */
class AssignSystemOwner extends Command
{
    protected $signature = 'factology:assign-system-owner
                            {--dry-run : Show what would change without writing}';

    protected $description = 'Assign the System Owner to all public classes';

    public function handle(): int
    {
        if (!DB::table('things')->where('thing_id', UUID::SYSTEM_OWNER)->exists()) {
            $this->error('The System Owner thing does not exist yet. Run migrations first (2026_08_09_000001_add_system_owner_thing).');
            return 1;
        }

        $query = DB::table('things')
            ->where('public', true)
            ->where('type', UUID::G_CLASS)
            ->where('deleted', false);

        $count = $query->count();

        if ($this->option('dry-run')) {
            $this->line("Would assign System Owner to {$count} public classes.");
            $samples = $query->limit(5)->pluck('name');
            foreach ($samples as $name) {
                $this->line("  - {$name}");
            }
            return 0;
        }

        $updated = $query->update([
            'owner'          => UUID::SYSTEM_OWNER,
            'record_updated' => now(),
        ]);

        $this->info("Assigned System Owner to {$updated} public classes.");
        $this->line('Next: run `php artisan factology:export-system-objects` to regenerate resources/js/localDb/system-objects.json.');

        return 0;
    }
}
