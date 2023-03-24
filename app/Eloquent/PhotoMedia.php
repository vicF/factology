<?php
/**
 * facts1
 * User: fokin
 * Created: 16/02/2020
 */

namespace App\Eloquent;


use Illuminate\Database\Eloquent\Model;

/**
 * Class File
 *
 * @package App\Eloquent
 * @property $thing_id
 * @property $filename
 * @property $path
 * @property $size
 * @property $crc
 */
class PhotoMedia extends Model
{
    public $incrementing = false;
    public $timestamps = false;
    public const _ID = 'photo_media.' . Thing::ID;

    protected $primaryKey = Thing::ID;
    protected $keyType = 'string';
    protected $fillable = [Thing::ID, 'filename', 'size', 'crc', 'exif_date', 'latitude', 'longitude'];
}