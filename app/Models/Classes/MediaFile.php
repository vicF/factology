<?php
/**
 * factology
 * User: fokin
 * Created: 26/05/2020
 */

namespace App\Models\Classes;

use Fokin\Facts\Data\UUID;
use Illuminate\Support\Facades\DB;

/**
 * @property $thing_id
 * @property $name
 * @property $description
 * @property $start
 * @property $end
 * @property $class_id
 * @method MediaFile thing_id($thing_id)
 * @method MediaFile name($name)
 * @method MediaFile description($description)
 * @method MediaFile start($start)
 * @method MediaFile end($end)
 * @method MediaFile class_id($class_id)
 *
 * @property string $source_id
 * @method MediaFile source_id($source_id)
 * @property string $source_name
 * @method MediaFile source_name($source_name)
 * @property string $folder_id
 * @method MediaFile folder_id($folder_id)
 * @property string $folder_name
 * @property int ctime
 * @method MediaFile folder_name($folder_name)
 */
class MediaFile extends \App\Models\Classes\Thing
{
    public $additionalParams = ['class_id', 'source_id', 'source_name', 'file_deleted', 'folder_id', 'path', 'size', 'crc', 'filename', 'last_seen', 'ctime'];
    public $defaults = [
        'class_id' => UUID::FILE,
        'end'      => null,
        'type'     => UUID::G_THING,
    ];
    public string $additional_template = 'partials.object.view.additional.file';

    public function fix()
    {
        if (empty($this->getClassesIds())) {
            $this->setClass(UUID::FILE);
        }
        //$links = $this->getLinks();
        if (empty($this->getLinks(UUID::LINK_TO_SOURCE))) {
            $this->setLink(UUID::LINK_TO_SOURCE, $this->source_id, 'Copy of file "' . $this->getSource()->name . '"');
        }
        if (empty($this->getLinks(UUID::LINK_TO_STORAGE))) {
            $Folder = Anything::createFromId($this->folder_id);
            $this->setLink(UUID::LINK_TO_STORAGE, $this->folder_id, 'File stored in  "' . $Folder->name . '"');
        }
    }

    public function getSource(): Media
    {
        return Media::createFromId($this->source_id);
    }

    /**
     * Called before creating with links to fill parameters with defaults or throw error for missing
     */
    protected function _validateAdditionalParameters()
    {
        if (!isset($this->_data['source_id'])) {
            throw new \RuntimeException('Missing source_id parameter');
        }
        if (!isset($this->_data['folder_id'])) {
            throw new \RuntimeException('Missing folder_id parameter');
        }
        if (!isset($this->_data['source_name'])) {  // This can lead to error if we are inside transaction and media was just created
            try {
                $Source = Media::createFromId($this->source_id);
                $this->source_name = $Source->name;
            } catch (\Throwable $e) {
                throw new \LogicException('Please define "source_name" parameter for the media file object', 1, $e);
            }
        }
        /*
         // Why we need folder name here?
         if (!isset($this->_data['folder_name'])) {
            $Folder = Media::createFromId($this->folder_id);
            $this->folder_name = $Folder->name;
        }*/
        parent::_validateAdditionalParameters();

    }


    /**
     * Calls save method and then creates additional links
     *
     * @return MediaFile
     */
    public function createWithLinks(): self
    {
        $this->class_id = UUID::FILE;
        parent::createWithLinks();
        DB::table('photo_files')->where('media_thing_id', $this->source_id)->updateOrInsert(
            [
                'media_thing_id' => $this->source_id,  // photo_files table has thing_id column that references to media thing id.
                'file_thing_id'  => $this->thing_id,  // meanwhile file_thing_id references file thing id
                'filename'       => $this->name,
                'path'           => $this->path,
                'size'           => $this->size,
                'crc'            => $this->crc,
                'file_deleted'   => 0,
                'folder_id'      => $this->folder_id,
                'last_seen'      => time(),
                'ctime'          => $this->ctime,

            ]);
        $this->setLink(UUID::LINK_TO_SOURCE, $this->source_id, 'Copy of file "' . $this->source_name . '"');
        $Folder = self::createFromId($this->folder_id);
        $this->setLink(UUID::LINK_TO_STORAGE, $this->folder_id, 'File stored in  "' . $Folder->name . '"');
        return $this;
    }

    public static function findMatchingFiles($file): array
    {
        // @TODO We could have checked for matching media first and then select matching file
        $query = DB::table('photo_files')
            ->select('photo_files.*', 'photo_media.exif', 'photo_media.filename as source_filename',
                'photo_media.latitude', 'photo_media.longitude', 'photo_media.exif_date', 'things.start', 'things.name', 'photo_media.phash')
            ->join('photo_media', 'photo_files.media_thing_id', 'photo_media.thing_id')
            ->join('things', 'photo_media.thing_id', 'things.thing_id')
            ->where('photo_files.size', $file['size'])
            ->where('photo_files.filename', $file['name'])
            ->where('photo_files.crc', $file['crc'])//->where('photo_media.sha256', $sha256)//->where('deleted', 0)
        ;
        if (null !== $file['folder_id']) {
            $query->where('folder_id', $file['folder_id']);
        }
        if (null !== $file['path']) {
            $query->where('path', $file['path']);
        }
        if (null !== $file['phash']) {
            $query->where(function ($query) use ($file) {
                $query->where('phash', $file['phash'])
                    ->orWhereNull('phash');
            });
        }
        return $query->get()
            ->toArray();
        /*foreach ($query as $row) {
            $res[] = self::createFromId($row->thing_id);
        }
        return $res;*/
    }

    public static function findMatchingFilesByPath($file): array
    {
        // @TODO We could have checked for matching media first and then select matching file
        $query = DB::table('photo_files')
            ->select('photo_files.*', 'photo_media.exif', 'photo_media.filename as source_filename',
                'photo_media.latitude', 'photo_media.longitude', 'photo_media.exif_date', 'things.start', 'things.name', 'photo_media.phash')
            ->join('photo_media', 'photo_files.media_thing_id', 'photo_media.thing_id')
            ->join('things', 'photo_media.thing_id', 'things.thing_id')
            ->where('photo_files.filename', $file['filename'])
            ->where('photo_files.path', $file['path'])
            ->where('photo_files.folder_id', $file['folder_id']);

        return $query->get()
            ->toArray();
    }

    /**
     * Find file registered in the database that has same parameters as tested one
     *
     * @param $size
     * @param $sha256
     * @param null $folder_id
     * @param null $path
     * @return array
     */
    public static function findByParameters($size, $sha256, $folder_id = null, $path = null, $phash = null, $crc = null): array
    {
        // @TODO We could have checked for matching media first and then select matching file
        $query = DB::table('photo_files')
            ->select('photo_files.*', 'photo_media.exif', 'photo_media.filename as source_filename',
                'photo_media.latitude', 'photo_media.longitude', 'photo_media.exif_date', 'things.start', 'things.name', 'photo_media.phash')
            ->join('photo_media', 'photo_files.media_thing_id', 'photo_media.thing_id')
            ->join('things', 'photo_media.thing_id', 'things.thing_id')
            ->where('photo_media.size', $size)
            ->where('photo_media.sha256', $sha256)//->where('deleted', 0)
        ;
        if (null !== $folder_id) {
            $query->where('folder_id', $folder_id);
        }
        if (null !== $path) {
            $query->where('path', $path);
        }
        if (null !== $phash) {
            $query->where('phash', $phash);
        }
        return $query->get()
            ->toArray();
        /*foreach ($query as $row) {
            $res[] = self::createFromId($row->thing_id);
        }
        return $res;*/
    }

    /**
     * Find file registered in the database that has same parameters as tested one
     *
     * @param $size
     * @param $crc
     * @param $name
     * @return array
     */
    public static function findSimilarByParameters($size, $crc, $name = null): array
    {
        //$res = [];
        $query = DB::table('photo_files')
            ->select('photo_files.*', 'photo_media.phash', 'photo_media.exif', 'photo_media.filename as source_filename',
                'photo_media.latitude', 'photo_media.longitude', 'photo_media.exif_date', 'things.start', 'things.name',)
            ->join('photo_media', 'photo_files.media_thing_id', 'photo_media.thing_id')
            ->join('things', 'photo_media.thing_id', 'things.thing_id')
            ->orWhere('photo_files.size', $size)
            ->orWhere('photo_files.crc', $crc)//->where('deleted', 0)
            //->orderBy('')
        ;

        if (null !== $name) {
            $query->orWhere('photo_files.filename', $name)
                ->orWhere('photo_media.filename', $name);
        }

        return $query->get()
            ->toArray();
        /*foreach ($query as $row) {
            $res[] = self::createFromId($row->thing_id);
        }
        return $res;*/
    }

    public static function findByPhash($phash)
    {
        $query = DB::table('photo_files')
            ->select('photo_files.*', 'photo_media.phash', 'photo_media.exif', 'photo_media.filename as source_filename',
                'photo_media.latitude', 'photo_media.longitude', 'photo_media.exif_date', 'things.start', 'things.name',)
            ->join('photo_media', 'photo_files.media_thing_id', 'photo_media.thing_id')
            ->join('things', 'photo_media.thing_id', 'things.thing_id')
            ->where('photo_media.phash', $phash)//->orderBy('')
        ;


        return $query->get()
            ->toArray();
    }

    public static function seenFile($id)
    {
        DB::table('photo_files')
            ->where('id', $id)
            ->update(['last_seen' => (string)time()]);
    }

    public static function getMimeTypeClassId($mime)
    {
        [$type] = explode('/', $mime);
        switch ($type) {
            case 'image':
                $mediaClass = UUID::PHOTO;
                break;
            case 'video':
                $mediaClass = UUID::VIDEO;
                break;
            case 'audio':
                $mediaClass = UUID::AUDIO;
                break;
            default:
                throw new \LogicException('Unknown media type: ' . $type);
        }
        return $mediaClass;
    }

    /**
     * @param $id
     * @return \Illuminate\Database\Query\Builder
     */
    protected static function _getRowQuery($id)
    {
        return DB::table('things')
            ->select('things.*', 'photo_files.*')
            ->where('things.thing_id', $id)
            ->leftJoin('photo_files', 'things.thing_id', 'photo_files.file_thing_id');
    }
}