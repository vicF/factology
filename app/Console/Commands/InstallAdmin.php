<?php

namespace App\Console\Commands;

use App\Models\Classes\UserClass;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class InstallAdmin extends Command
{
    protected $signature = 'factology:install-admin
                            {--email= : Admin email address}
                            {--name= : Admin display name}
                            {--password= : Admin password or "auto" to generate}';

    protected $description = 'Create the initial admin user for a fresh installation';

    public function handle(): int
    {
        if (\App\Models\User::count() > 0) {
            $this->warn('Users already exist. Skipping admin creation.');
            return 0;
        }

        $email    = $this->option('email') ?? $this->ask('Admin email', 'admin@factology.local');
        $name     = $this->option('name')  ?? $this->ask('Admin name', 'Admin');
        $password = $this->option('password');

        // Auto-generate a random password if --password=auto
        if ($password === 'auto' || $password === null) {
            $password = bin2hex(random_bytes(12)); // 24-char hex string
            $generated = true;
        } else {
            $generated = false;
        }

        if (empty($password)) {
            $this->error('Password cannot be empty.');
            return 1;
        }

        $userClass = new UserClass([
            'name'     => $name,
            'email'    => $email,
            'password' => Hash::make($password),
        ]);

        $userClass->save();
        $user = $userClass->getUser();
        $user->is_admin = true;
        $user->save();

        $this->info('Admin user created successfully.');
        $this->line("  Email:    {$email}");
        $this->line("  Name:     {$name}");

        if ($generated) {
            $this->line("  Password: {$password}");
            $this->warn('  Save this password now — it will not be shown again.');
        }

        return 0;
    }
}
