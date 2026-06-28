<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class ResetAdminPassword extends Command
{
    protected $signature = 'factology:reset-admin-password
                            {--email= : Admin email (defaults to first admin found)}';

    protected $description = 'Generate a new random password for an admin user';

    public function handle(): int
    {
        $email = $this->option('email');

        if ($email) {
            $user = User::where('email', $email)->where('is_admin', true)->first();
            if (!$user) {
                $this->error("Admin with email '{$email}' not found.");
                return 1;
            }
        } else {
            $user = User::where('is_admin', true)->first();
            if (!$user) {
                $this->error('No admin users found.');
                return 1;
            }
        }

        $password = bin2hex(random_bytes(12));
        $user->password = Hash::make($password);
        $user->save();

        $this->info('Admin password reset successfully.');
        $this->line("  Email:    {$user->email}");
        $this->line("  Password: {$password}");
        $this->warn('  Save this password now — it will not be shown again.');

        return 0;
    }
}
