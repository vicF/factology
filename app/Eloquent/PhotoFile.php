<?php
/**
 * facts1
 * User: fokin
 * Created: 22/10/2019
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
class PhotoFile extends Model
{
    public $incrementing = false;
    public $timestamps = false;
    public const _ID = 'photo_files.' . Thing::ID;

    protected $primaryKey = Thing::ID;
    protected $keyType = 'string';
    protected $fillable = [Thing::ID, 'filename', 'path', 'size', 'crc', 'folder_id'];
}
