<?php
/**
 * factology
 * User: fokin
 * Created: 26/05/2020
 */

namespace App\Models\Classes;


use App\Eloquent\Thing;
use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;

/**
 * Class Media
 *
 * @property mixed exif_date
 * @property mixed latitude
 * @property mixed longitude
 * @property mixed size
 * @property mixed crc
 * @property mixed exif
 * @property string phash
 * @property mixed sha256
 * @package App\Models\Classes
 * @method static Media createFromId(int $id)
 */
class Media extends \App\Models\Classes\Thing
{
    public $defaults =
        [
            'deleted'   => 0,
            'end'       => null,
            'exif'      => null,
            'exif_date' => null,
            'latitude'  => null,
            'longitude' => null,
            'phash'     => null,
            'public'    => 0,
            'sha256'    => null,
            'type'      => UUID::G_THING,
        ];
    public $additionalParams =
        [
            'class_id',
            'crc',
            'event_date',
            'exif',
            'exif_date',
            'filename',
            'latitude',
            'longitude',
            'phash',
            'size',
            'sha256',
        ];
    public string $additional_template = 'partials.object.view.additional.media';

    /**
     * @var mixed
     */


    public function fix($class)
    {
        // Check if media has class
        if (empty($this->getClassesIds())) {
            $this->setClass($class);
        }
    }

    protected static function _getRow($id)
    {
        return DB::table('things')->join('photo_media', 'photo_media.thing_id', 'things.thing_id')->where(Thing::_ID, $id);
    }

    public static function findByParameters($size, $crc)
    {
        return DB::table('photo_media')
            ->where('size', $size)
            ->where('crc', $crc)
            ->get()
            ->toArray();
    }

    public static function findMatchingFile($file)
    {
        return DB::table('photo_media')
            ->where('size', $file['size'])
            ->where('crc', $file['crc'])
            ->get()
            ->toArray();
    }

    public function createWithLinks()
    {
        parent::createWithLinks();
        DB::table('photo_media')->where('thing_id', $this->thing_id)->updateOrInsert(
            [
                'thing_id'      => $this->thing_id,
                'filename'      => $this->name,
                'size'          => $this->size,
                'crc'           => $this->crc,
                'exif_date'     => $this->exif_date,
                'event_date'    => $this->start, // just a copy of start for faster selects
                'latitude'      => @$this->latitude,
                'longitude'     => @$this->longitude,
                'exif'          => json_encode($this->exif),
                'media_deleted' => $this->deleted,
                'phash'         => $this->phash,
                'sha256'        => $this->sha256,
            ]);
        //$this->save();
    }

    /**
     * @param $id
     * @return \Illuminate\Database\Query\Builder
     */
    protected static function _getRowQuery($id)
    {
        return DB::table('things')
            ->where(Thing::_ID, $id)
            ->select('things.* ', 'photo_media.*')
            ->leftJoin('photo_media', Thing::_ID, 'photo_media.thing_id');
    }

    public function getSpecificData()
    {
        $files = DB::table('photo_files')
            ->select([
                'photo_files.*',
                'folder.*',
                'machine.name AS machine_name',
                'machine.thing_id AS machine_id',
                'machine.description AS machine_description',
            ])
            ->where('media_thing_id', $this->thing_id)
            ->leftJoin('things AS folder', 'folder_id', 'thing_id')
            ->leftJoin('links', function ($join) {
                $join->on('links.thing_id', 'folder_id');
                $join->on('link_type_id', DB::raw("'" . UUID::INSIDE . "'"));
            })
            ->leftJoin('things AS machine', 'links.other_thing_id', 'machine.thing_id')
            //->leftJoin('things machine', '')

            ->get()->toArray();
        return ['files' => $files];
    }

    public function save()
    {
        parent::save();
        DB::table('photo_media')
            ->where('thing_id', $this->thing_id)
            ->update([
                'event_date' => $this->start,
            ]);
    }
}