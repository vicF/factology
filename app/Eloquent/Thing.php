<?php

namespace App\Eloquent;

use App\Eloquent\Scopes\AuthScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Class Thing
 *
 * @package App\Eloquent
 * @property $thing_id
 * @property $name
 * @property $start
 * @property $description
 * @property $references
 * @property $links
 * @method static find()
 * @method static Thing where(string $string, string $name)
 * @deprecated
 */
class Thing extends Model
{
    public const ID = 'thing_id';
    public const _ID = 'things.thing_id';

    public $incrementing = false;
    public $timestamps = false;

    protected $primaryKey = self::ID;
    protected $keyType = 'string';
    protected $fillable = [
        self::ID,
        'name',
        'type',
        'description',
        'start',
        'start_variety',
        'end',
        'end_variety',
        'public',
        'owner'];

    /**
     *
     */
    protected static function booted()
    {
        static::addGlobalScope(new AuthScope);
    }

    public function links(): HasMany
    {
        return $this->hasMany(Link::class, self::ID, self::ID);
    }

    public function references(): HasMany
    {
        return $this->hasMany(Link::class, 'other_thing_id', self::ID);
    }

    public function things(): BelongsToMany
    {
        return $this->belongsToMany(__CLASS__, 'links')->withPivot(Link::TYPE);
    }

    /** @noinspection PhpUnused */
   /* public function getStart(): ?string
    {
        return Anything::dateFromDb($this->attributes['start']);
    }*/

    /** @noinspection PhpUnused */
    /*public function setStart($value): void
    {
        $this->attributes['start'] = Anything::dateToDb($value);
    }*/

    /** @noinspection PhpUnused */
    /*public function getEndAttribute(): ?string
    {
        return Anything::dateFromDb($this->attributes['end']);
    }*/

    /** @noinspection PhpUnused */
    /*public function setEndAttribute($value): void
    {
        $this->attributes['end'] = Anything::dateToDb($value);
    }*/
}
