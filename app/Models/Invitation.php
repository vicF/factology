<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Admin-managed invitation for key-based registration.
 *
 * @property int $id
 * @property int $creator_id
 * @property string $token
 * @property string|null $public_key
 * @property string|null $thing_id
 * @property string|null $note
 * @property \Illuminate\Support\Carbon $expires_at
 * @property \Illuminate\Support\Carbon|null $claimed_at
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 */
class Invitation extends Model
{
    protected $fillable = [
        'creator_id',
        'token',
        'public_key',
        'thing_id',
        'note',
        'expires_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'claimed_at' => 'datetime',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'creator_id');
    }
}