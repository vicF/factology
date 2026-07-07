<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LegalConsent extends Model
{
    protected $fillable = [
        'user_id',
        'document_type',
        'document_version',
        'country_code',
        'ip_address',
        'user_agent',
        'agreed_at',
    ];

    protected $casts = [
        'agreed_at' => 'datetime',
    ];

    public $timestamps = false;

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
