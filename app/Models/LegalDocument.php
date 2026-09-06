<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LegalDocument extends Model
{
    protected $fillable = [
        'type',
        'country',
        'locale',
        'version',
        'title',
        'content',
    ];
}
