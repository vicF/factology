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
                            {--password= : Admin password}';

    protected $description = 'Create the initial admin user for a fresh installation';

    public function handle(): int
    {
        if (\App\Models\User::count() > 0) {
            $this->warn('Users already exist. Skipping admin creation.');
            return 0;
        }

        $email    = $this->option('email') ?? $this->ask('Admin email', 'admin@factology.local');
        $name     = $this->option('name')  ?? $this->ask('Admin name', 'Admin');
        $password = $this->option('password') ?? $this->secret('Admin password');

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

        $this->info("Admin user '{$email}' created successfully.");
        return 0;
    }
}
