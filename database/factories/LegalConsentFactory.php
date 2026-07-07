<?php

namespace Database\Factories;

use App\Models\LegalConsent;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class LegalConsentFactory extends Factory
{
    protected $model = LegalConsent::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'document_type' => $this->faker->randomElement(['terms', 'privacy']),
            'document_version' => '1.0.0',
            'country_code' => '*',
            'ip_address' => $this->faker->ipv4(),
            'agreed_at' => now(),
        ];
    }
}
