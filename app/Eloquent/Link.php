<?php

namespace App\Eloquent;

use Fokin\Facts\Data\UUID;
use Illuminate\Database\Eloquent\Model;

/**
 * Class Link
 *
 * @package App\Eloquent
 * @property string $one_thing_id
 * @property $link_type_id
 * @property $other_thing_id
 * @property $translation
 * @method static \Illuminate\Database\Query\Builder ofClass($class)
 */
class Link extends Model
{
    public const LINK_ID = 'link_id';
    public const _THING_ID = 'links.' . Thing::ID;
    public const TYPE = 'link_type_id';
    public const TARGET = 'other_thing_id';

    public $incrementing = false;
    public $timestamps = false;

    protected $keyType = 'string';
    protected $primaryKey = self::LINK_ID;

    public function scopeOfClass($query, $class)
    {
        return $query
            ->where('links.' . self::TYPE, UUID::LINK_TO_CLASS)
            ->where('links.' . self::TARGET, $class);
    }
}
