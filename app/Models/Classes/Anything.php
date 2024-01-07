<?php
/**
 * facts1
 * User: fokin
 * Created: 07/10/2019
 */

namespace App\Models\Classes;

use App\Eloquent\Link;
use App\Eloquent\Thing;
use Fokin\Facts\Data\UUID;
use http\Exception\RuntimeException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Class Anything
 *
 * @package Fokin\facts\Classes
 * @property string $thing_id
 * @property string $name
 * @property string $description
 * @property string $start
 * @property string $end
 * @property string $start_date
 * @property string $end_date
 * @property boolean deleted
 * @method Anything thing_id($thing_id)
 * @method Anything name($name)
 * @method Anything description($description)
 * @method Anything start($start)
 * @method Anything end($end)
 */
class Anything
{
    /**
     * @deprecaed use UUID constants
     */
    public const GENERAL = UUID::GENERAL;

    /**
     * @deprecaed use UUID constants
     */
    public const CLS = UUID::G_CLASS;

    /**
     * @deprecaed use UUID constants
     */
    public const LINK = UUID::G_LINK;

    /**
     * @deprecaed use UUID constants
     */
    public const THING = UUID::G_THING;
    public static $typeNames = [
        'GENERAL'  => UUID::GENERAL,
        'CLASS'    => UUID::G_CLASS,
        'LINK'     => UUID::G_LINK,
        'THING'    => UUID::G_THING,
        'EXTERNAL' => UUID::G_EXTERNAL,
    ];

    public const TIME_FORMAT = 'Y-m-d H:i:s';
    public const DATABASE_TIME_FORMAT = 'YmdHis';

    public string $template = 'partials.object.view.main.properties';
    public string $additional_template = ''; //'partials.object.view.additional.properties';
    public \stdClass $class; // @TODO seems to be not really used

    protected $_data;
    protected $_eloquentModel;
    protected $_classes;
    protected $_tableFields = [
        'deleted',
        'description',
        'end',
        'end_variety',
        'name',
        'public',
        'start',
        'start_variety',
        'thing_id',
        'type',
    ];

    public $params = [
        'deleted',
        'description',
        'end',
        'end_date',
        'end_variety',
        'name',
        'public',
        'record_created',
        'record_updated',
        'start',
        'start_date',
        'start_variety',
        'thing_id',
        'type',
        'owner',
    ];
    public $defaults = ['end' => null, 'public' => 0];
    public $additionalParams = [];

    /**
     * Anything constructor.
     *
     * @param array|null $data
     * @param Anything|null $class
     */
    public function __construct(array $data = null, $class = null)
    {
        LOG::debug('Creating object from data: ' . print_r($data, 1) . "\nclass: " . print_r($class, 1));
        if (!empty($data)) {
            if (array_key_exists('thing_id', $data) && count($data) === 1) {
                // Only id is given. Need to load data
                $data = (array)static::_getRow($data['thing_id'])->first();
            }
            if (empty($data)) {
                abort(401, 'Authorization required to access this resource');
            } else {
                try {
                    $this->setData($data);
                } catch (\Throwable $e) {
                    throw new \RuntimeException('Failed to set object data: ' . print_r($data, 1), null, $e);
                }
            }
        }
        if (empty($this->class) && $class !== null) {
            $this->class = $class;
        }
    }

    protected function _setDefaults()
    {
        foreach ($this->defaults as $param => $value) {
            if (!array_key_exists($param, $this->_data)) {
                $this->$param = $this->defaults[$param];
            }
        }
    }

    protected function _validateAdditionalParameters()
    {
        foreach ($this->additionalParams as $param) {
            if (!array_key_exists($param, $this->_data)) {
                if (array_key_exists($param, $this->defaults)) {
                    $this->$param = $this->defaults[$param];
                } else {
                    throw new \RuntimeException("Missing parameter $param");
                }
            }
        }
    }

    /**
     * Sets data and applies transformations to dates
     *
     * @param $data
     * @return array
     */
    public function setData(array $data): array
    {
        if (array_key_exists('class', $data) && is_string($data['class'])) {
            $data['class'] = $this->getClassByClassId($data['class']);
        }
        foreach ((array)$data as $key => $value) {
            $this->$key = $value;
        }
        return $this->_data;
    }


    public function getData(): array
    {
        $data = $this->_data;
        /*$data['start'] = self::dateFromDb($this->_data['start']);
        $data['end'] = self::dateFromDb($this->_data['end']);*/
        return $data;
    }


    /**
     * @return array|BSONDocument|Model|null
     */
    public function getModel()
    {
        if ($this->_eloquentModel === null) {
            $id = $this->_data[Thing::ID];
            if ($id === null) {
                throw new \RuntimeException('Missing ID for the object');
            }
            $this->_eloquentModel = Thing::find($id);
        }
        return $this->_eloquentModel;
    }

    /**
     * @param $id
     * @return \Illuminate\Database\Query\Builder
     */
    protected static function _getRowQuery($id)
    {
        return Db::table('things')
            ->select('things.*')
            ->where(Thing::_ID, $id);  // Eloquent tables don't allow joins
    }

    protected static function _getRow($id)
    {

        $query = static::_getRowQuery($id)->auth();
        /*if (!Auth::check()) {
            $query->where('things.public', 1);
        } else {
            // Access rights
            $query->select('things.*')->leftJoin('links', function ($join) {
                $join->on('links.thing_id', 'things.thing_id')
                    ->where('link_type_id', UUID::GROUP_READ_ACCESS)
                    ->whereIn('links.other_thing_id', function ($query) {
                        $query->select('thing_id')
                            ->from('links')
                            ->where('other_thing_id', '40b075d8-8e08-4753-88ca-8a07d5a55765')
                            ->where('link_type_id', 'e18d73eb-a5d3-47be-a785-106f6f185651');
                    });
            })
                ->where(function ($query) {
                    $query->where('owner', Auth::user()->thing_id)
                        ->orWhereNotNull('links.thing_id');
                })
            ;
        }*/
        return $query;
    }

    /**
     * @TODO revise
     * This should return the name of PHP class to be instantiated.
     *
     * @param $id
     * @return Model|\Illuminate\Database\Query\Builder|object|null
     */
    public static function getClassDataByObjectId($id)
    {
        return DB::table('links')
            //->select('other_thing_id as id', 'class_name', 'c.name as any_class_name')
            ->where('links.one_thing_id', $id)
            ->where('link_type_id', UUID::LINK_TO_CLASS)
            ->leftJoin('classes', 'links.other_thing_id', 'classes.thing_id')
            ->leftJoin('things as c', 'links.other_thing_id', 'c.thing_id')
            ->first();
    }

    /**
     * @param $id
     * @return string
     */
    public static function getClassNameFromClassdata($classData)
    {
        return '\\App\\Models\\Classes\\' . ($classData?->class_name ?? 'Anything');
    }

    /**
     * @param $id
     * @return Anything
     */
    public static function CreateFromId($id)
    {
        LOG::debug('Creating object from id: ' . $id);
        $class = self::getClassDataByObjectId($id);
        $className = self::getClassNameFromClassdata($class); //'\\App\\Models\\Classes\\' . ($class->class_name ?? 'Anything');
        try {
            return new $className(['thing_id' => $id], $class);
            /** @var Anything $className */
            /*$thing = $className::_getRow($id)->first();
            // Keep date in db format to be able to compare
            return $className::CreateFromData(self::convertToArray($thing));*/
        } catch (ModelNotFoundException $e) {
            abort(404);
            //throw new \RuntimeException('No object with uuid=' . $id, 404, $e);
        }
    }

    /**
     * Returns data and links to display object on the web
     * @return void
     */
    public static function getDataById($id): array
    {
        LOG::debug('retrieving object data for id: ' . $id);
        $class = self::getClassDataByObjectId($id);
        $className = self::getClassNameFromClassdata($class); //'\\App\\Models\\Classes\\' . ($class->class_name ?? 'Anything');

        try {
            /** @var Anything $className */
            return $className::getClassSpecificDataById($id, $class);

            /*$thing = $className::_getRow($id)->first();
            // Keep date in db format to be able to compare
            return $className::CreateFromData(self::convertToArray($thing));*/
        } catch (ModelNotFoundException $e) {
            abort(404);
            //throw new \RuntimeException('No object with uuid=' . $id, 404, $e);
        }
    }

    public static function getClassSpecificDataById($id, $class): array
    {
        $thing = (array)static::_getRow($id)->first();
        if (empty($thing)) {
            abort(404);
        }
        $thing['class'] = $class;
        $first = DB::table('links') // One way links
        ->where('links.one_thing_id', $thing['thing_id'])
            ->leftJoin('things', 'links.other_thing_id', '=', 'things.thing_id')
            ->limit(50);

        $second = DB::table('links') // other way links
        ->where('links.other_thing_id', $thing['thing_id'])
            ->leftJoin('things', 'links.one_thing_id', '=', 'things.thing_id')
            ->limit(50);

        $thing['links'] = $first
            ->union($second)
            ->orderBy('start') // replace 'your_column_name' with the column you want to use for ordering
            ->get();
        return $thing;
    }

    /**
     * Accepts data with dates like 2020-01-01
     * Converts dates to DB format like 202001010000000000
     *
     * @param array $ObjectData
     * @param null $class
     * @return static
     */
    public static function CreateFromData(array $ObjectData, $class = null)
    {
        //$className = self::getClassById($ObjectData->thing_id);
        $className = self::getPhpClassFromInput($ObjectData);
        if (!empty($className)) {
            $className = '\\App\\Models\\Classes\\' . $className;
            return new $className($ObjectData);
        } else {
            return new static($ObjectData, $class);
        }
    }

    public static function getPhpClassFromInput(array $ObjectData)
    {
        if (!is_array(@$ObjectData['link']['type'])) {
            return null;
        }
        foreach ($ObjectData['link']['type'] as $key => $uuid) {
            if ($uuid === UUID::LINK_TO_CLASS) {
                $classUuid = $ObjectData['link']['uuid'][$key];
                return DB::table('classes')
                    ->where('thing_id', $classUuid)
                    ->value('class_name');
            }
        }
    }

    /**
     * @param array $ObjectData
     * @return static
     * @deprecated
     */
    public static function CreateFromRawData(array $ObjectData)
    {
        return new static($ObjectData);
    }

    /**
     * @param BSONDocument|array|null $data
     * @return array
     */
    protected static function convertToArray($data)
    {
        if ($data instanceof Model) {
            return $data->toArray();
        }
        if ($data instanceof \stdClass) {
            return (array)$data;
        }
        if (is_array($data)) {
            return $data;
        }
        if ($data === null) {
            return [];
        }
        throw new \RuntimeException('Unexpected type of data. Accept BSONDocument or array');
    }

    public static function convertToRaw($data)
    {
        $data = static::convertToArray($data);
        $data['start'] = static::dateToDb($data['start']);
        if (!empty($data['end'])) {
            $data['end'] = static::dateToDb($data['end']);
        }
        return $data;
    }

    public static function convertFromRaw($data)
    {
        $data['start'] = self::dateFromDb($data['start']);
        $data['end'] = self::dateFromDb($data['end']);
        return $data;
    }

    public function __call($method, $args)
    {
        // Set parameter through function
        if (in_array($method, $this->params, true) || in_array($method, $this->additionalParams, true)) {
            $this->$method = $args[0];
            return $this;
        }
    }

    public function __set($key, $value)
    {
        if (in_array($key, $this->params, true) || in_array($key, $this->additionalParams, true)) {
            $this->_data[$key] = $value;
            // set dependant fields
            switch ($key) {
                case 'start':
                    Log::debug('start: ' . $value);
                    $this->_data['start_date'] = self::dateFromDb($value);
                    break;
                case 'end':
                    $this->_data['end_date'] = self::dateFromDb($value);
                    break;
                case 'start_date':
                    Log::debug('start_date: ' . $value);
                    $this->_data['start'] = self::dateToDb($value);
                    break;
                case 'end_date':
                    $this->_data['end'] = self::dateToDb($value);
                    break;
            }
        }
    }

    public function __isset($key)
    {
        return array_key_exists($key, $this->_data) && $this->_data[$key] !== null;
    }

    public function __get($key)
    {
        if ($key === 'name' && !array_key_exists($key, $this->_data)) {
            $this->_data['name'] = Thing::find($this->thing_id)->name; // This can lead to error if we are inside a transaction and object was just created
        }
        /*if (($key === 'start_date' || $key === 'end_date') && empty($this->_data[$key])) {
            [$ikey] = explode('_', $key);
            $this->_setDateFromDb($ikey);
        }*/
        if (!is_array($this->_data)) {
            throw new \LogicException("Data is not initialised, \"$key\" is not defined");
        }
        if (!array_key_exists($key, $this->_data)) {
            throw new \LogicException("Property \"$key\" is not defined");
        }
        return $this->_data[$key];
    }

    /*protected function _setDateFromDb($key)
    {
        $this->_data[$key . '_date'] = self::dateFromDb($this->_data[$key]);
    }*/


    public function toJson($depth = 0)
    {
        $data = $this->toArray();
        return json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    }

    public function toArray(): array
    {
        return $this->_data;
    }

    protected function _validate()
    {
        $this->_setDefaults();
        $errors = [];
        if (!isset($this->name)) {
            $errors[] = 'Empty name';
        }
        if (!isset($this->type)) {
            $errors[] = 'Empty type';
        } else if (!in_array((int)$this->type, [UUID::G_CLASS, UUID::G_LINK, UUID::G_THING, UUID::GENERAL, UUID::G_EXTERNAL], true)) {
            $errors[] = 'Unknown type: ' . $this->type;
        }
        if (count($errors) === 0) {
            return true;
        }
        throw new \RuntimeException(print_r($errors, 1));
    }

    /**
     */
    public function save()
    {
        $this->_validate();
        //$this->_eloquentModel = new Thing($this->_data); // @TODO Do we need eloquent here???
        $data = array_intersect_key($this->_data, array_flip($this->_tableFields));
        if (empty($this->thing_id)) {
            // generating new UUID for the object
            $data['thing_id'] = $this->thing_id = (string)Str::uuid();
            /*$this->_eloquentModel->exists = false;
            $this->_eloquentModel->fill($this->_data);*/
            DB::table('things')->insert($data);
        } else {
            unset($data->thing_id);
            DB::table('things')->where('thing_id', $this->thing_id)->update($data);
            //$this->_eloquentModel->exists = true;
        }
        //$this->_eloquentModel->save();
        // Symlink to class icon if self icon is not available
        /** @noinspection NotOptimalIfConditionsInspection */

    }

    public function saveThumb($file = null)
    {
        $target = $this->getThumbLocalPath();
        /** @noinspection MkdirRaceConditionInspection */
        @mkdir(dirname($target), 0775, true);
        if (@$file) {
            $image = new \claviska\SimpleImage();
            @unlink($target);
            $image->fromFile($file)
                //->maxColors(8, false)
                ->autoOrient()
                ->resize(100)
                ->toFile($target, 'image/jpeg', 20);
        }
        if (!is_file($target)) {
            if (!empty($this->getClassId())) {
                @$this->symlinkToThumb($this->getClassId()); // symlink icon from class
            } elseif (!empty(@$this->getParents()[0])) {
                @$this->symlinkToThumb($this->getParents()[0]->other_thing_id); // symlink icon from parent
            }
        }
    }


    public function delete()
    {
        return static::deleteById($this->thing_id);
    }

    /**
     * @param $id
     * @return bool|null
     * @throws \Exception
     */
    public static function deleteById($id): ?bool
    {
        @unlink(self::getThumbPathById($id, false));
        return Thing::where('thing_id', $id)->delete();
    }

    public function setLink($type, $target, $translation): bool
    {
        $link = new Link();
        $link->thing_id = $this->thing_id;
        $link->link_type_id = $type;
        $link->other_thing_id = $target;
        $link->translation = $translation;
        return $link->save();
    }

    public function setAsChildOf($parentClass): bool
    {
        $parentName = Thing::find($parentClass)->name;
        return $this->setLink(UUID::PARENT, $parentClass, "\"{$this->name}\" is child of \"{$parentName}\"");
    }

    public function setClass($class): bool
    {
        try {
            $className = $this->getClassByClassId($class)->name;
        } catch (\ErrorException $e) {
            throw new \RuntimeException("Unable to get name for class $class", 500, $e);
        }
        return $this->setLink(UUID::LINK_TO_CLASS, $class, "{$this->name} is of class \"{$className}\"");
    }

    public function getClassByClassId($classId)
    {
        return DB::table('things')
            ->select('thing_id', 'name')
            ->where('thing_id', $classId)
            ->first();
    }

    public function getExternalLinks()
    {
        $query = DB::table('external_links')->where('thing_id', $this->thing_id);
        $res = $query->get()->toArray();
        if (empty($res)) {
            $res = [[]];
        }
        return $res;
    }

    public function getReferences($linkType = null): array
    {
        return $this->_getLinksRefs('thing_id', $linkType);
    }

    /**
     * @param null $linkType
     * @return array
     */
    public function getLinks($linkType = null): array
    {
        return $this->_getLinksRefs('other_thing_id', $linkType);
    }

    /**
     * @param string $source
     * @param $linkType
     * @return mixed
     */
    protected function _getLinksRefs($source = 'thing_id', $linkType = null)
    {
        if ($source == 'thing_id') {
            $whereId = 'other_thing_id';
        } else {
            $whereId = 'thing_id';
        }
        $query = DB::table('links AS l')
            ->select(['l.*', 't.name AS thing_name', 't.start', 'type.name AS link_name', 'class.thing_id as class_id', 'class.name as class_name'])
            ->distinct()
            ->join('things AS t', static function ($join) use ($source) {
                $join->on('l.' . $source, 't.thing_id');
                if (!Auth::check()) {
                    $join->where('t.public', 1);  // For anonymous user
                        //->orWhere('t.owner', Auth::user()->thing_id);
                }
            })
            ->join('things AS type', 'l.link_type_id', 'type.thing_id')
            ->leftJoin('links as class_link', static function ($join) use ($source) {
                $join->on('l.' . $source, 'class_link.thing_id')
                    ->where('class_link.link_type_id', UUID::LINK_TO_CLASS);
            }
            )
            ->leftJoin('things as class', 'class_link.other_thing_id', 'class.thing_id')
            ->orderBy('t.start')
            ->where('l.' . $whereId, $this->thing_id)//->auth('l')
        ;
        if (null !== $linkType) {
            $query->where('l.link_type_id', $linkType);
        }
        $query->orderBy(DB::Raw('l.link_type_id = \'' . UUID::LINK_TO_CLASS . '\''), 'DESC')
            ->orderBy('t.start')
            ->limit(200);
        return $query->get()->toArray();
    }

    protected function _getLinkDataFromPost($link)
    {
        $res = [
            'translation'    => $link['description'],
            Thing::ID        => $this->{Thing::ID},
            'link_type_id'   => $link['type'],
            'other_thing_id' => $link['uuid'],
        ];
        return $res;
    }

    /**
     * @param $data
     */
    public function saveLinks($input)
    {
        $oldLinks = collect($this->getLinks())->keyBy(Link::LINK_ID)->toArray();

        if (empty($input['link'])) {
            return;
            //throw new \RuntimeException('Object should be linked at least to some class. No links were found');
        }
        $data = [];
        foreach (array_keys($input['link']) as $fieldKey) {
            foreach ($input['link'][$fieldKey] as $key => $value) {
                $data[$key][$fieldKey] = $value;
            }
        }
        foreach ($data as $link) {
            if (empty($link['description']) && empty($link['uuid'])) {
                continue; // Just an empty form
            }
            if (empty($link[Link::LINK_ID])) {
                DB::table('links')->insert(
                    $this->_getLinkDataFromPost($link));
            } else {
                DB::table('links')->where(Link::LINK_ID, $link[Link::LINK_ID])->update(
                    $this->_getLinkDataFromPost($link));
                unset($oldLinks[$link[Link::LINK_ID]]);
            }

        }
        if (!empty($oldLinks)) {
            DB::table('links')->whereIn(Link::LINK_ID, array_keys($oldLinks))->delete();
        }
    }

    /**
     * @param $data
     */
    public function saveExternalLinks($input)
    {
        if (empty($input['elink'])) {
            return;
        }
        $oldLinks = collect($this->getExternalLinks())->keyBy('id')->toArray();
        $data = [];
        foreach (array_keys($input['elink']) as $fieldKey) {
            foreach ($input['elink'][$fieldKey] as $key => $value) {
                $data[$key][$fieldKey] = $value;
            }
        }
        foreach ($data as $link) {
            if (empty($link['url'])) {
                continue; // Just an empty form
            }
            if (empty($link['id'])) {
                $link['id'] = Str::uuid();
                $link['thing_id'] = $this->thing_id;
                DB::table('external_links')->insert(
                    $link);
            } else {
                DB::table('external_links')->where('id', $link['id'])->update(
                    $link);
                unset($oldLinks[$link['id']]);
            }

        }
        if (!empty($oldLinks)) {
            DB::table('external_links')->whereIn('id', array_keys($oldLinks))->delete();
        }
    }

    public function getClasses()
    {
        return DB::table('links')
            ->auth()
            ->where('links.one_thing_id', $this->thing_id)
            ->where('link_type_id', UUID::LINK_TO_CLASS)
            ->where('things.deleted', 0)
            ->where('links.deleted', 0)
            ->join('things', 'other_thing_id', 'things.thing_id')
            ->get()
            ->toArray();
    }

    public function getClassesIds()
    {
        if (empty($this->_classes)) {
            $this->_classes = DB::table('links')
                ->join('things', 'links.one_thing_id', 'things.thing_id') // For auth
                ->auth('links')
                ->where('links.one_thing_id', $this->thing_id)
                ->where('link_type_id', UUID::LINK_TO_CLASS)
                ->where('links.deleted', 0)
                ->pluck('other_thing_id')->toArray();
        }
        return $this->_classes;
    }

    public function getClassId()
    {
        return @$this->getClassesIds()[0];
    }

    public function getParents()
    {
        return DB::table('links')
            ->join('things', 'links.one_thing_id', 'things.thing_id') // For auth
            ->auth()
            ->where('links.one_thing_id', $this->thing_id)
            ->where('link_type_id', UUID::PARENT)
            ->get('other_thing_id')->toArray();
    }

    public function getIterator()
    {
        return (function () {
            foreach ($this->_data as $key => $val) {
                yield $key => $val;
            }
        })();
    }

    /**
     * Returns fields for view
     *
     * @return \Generator
     */
    public function getViewIterator()
    {
        return (function () {
            foreach ($this->_data as $key => $val) {
                switch ($key) {
                    case 'type':
                        $val = array_flip(self::$typeNames)[$val];
                        break;
                    case 'public':
                        $val = $val ? 'Yes' : 'No';
                        break;
                }
                yield $key => $val;
            }
        })();
    }

    public
    static function yearHasMoreThan4Digits($date)
    {
        $date = ltrim($date, '-');
        $hyphenPos = strpos($date, '-');
        if ($hyphenPos > 4) {
            return true;
        }
        if ($hyphenPos === false) {
            return strlen($date) > 4;
        }
        return false;
    }

    /**
     * Adds missing parts of date, day, time etc.
     */
    public static function padDate($date)
    {
        static $pad = '-01-01 00:00:00';
        if (empty($date)) {
            return $date;
        }
        $sign = $date[0] === '-' ? '-' : '';
        $date = ltrim($date, '-');
        $hyphenPos = strpos($date, '-');
        if ($hyphenPos === false) {
            return $sign . $date . $pad;  // Only year was given
        }
        $remainingPartLength = strlen(substr($date, $hyphenPos));

        if ($remainingPartLength < 15) {
            // Need to pad
            $date .= substr($pad, -(15 - $remainingPartLength));
        }
        return $sign . $date;
    }

    public static function dateToDb($date, $timeZone = null)
    {
        if ($date === null) {
            return null;
        }
        if ($timeZone === null) {
            $timeZone = UUID::CLIENT_TIMEZONE;
        }
        $date = self::padDate($date);
        $bc = $date[0] === '-';
        try {
            if ($bc || self::yearHasMoreThan4Digits($date)) { // If date year has more than 4 digits
                if (($p = strpos($date, '.')) !== false) {
                    $date = substr($date, 0, $p);  // Remove dot and milliseconds if present
                }
                $milleniums = substr($date, 0, -18);
                $smallDate = '1' . substr($date, -18);
                $d = new \DateTime($smallDate, $timeZone === null ? null : new \DateTimeZone($timeZone));
                $number = $milleniums . substr($d->format(self::DATABASE_TIME_FORMAT), 1);
                if ($bc) { // Sorting correction for BC dates
                    $number = self::_correctBeforeBC($number);
                }
                return $number;
            } else {
                $d = new \DateTime($date, $timeZone === null ? null : new \DateTimeZone($timeZone));
                $d->setTimezone(new \DateTimeZone('UTC'));
                return $d->format(self::DATABASE_TIME_FORMAT);
            }


        } catch (\Throwable $e) {
            throw new \RuntimeException("Failed to parse date \"{$date}\", timezone \"$timeZone\"", 0, $e);
        }
    }

    public static function dateFromDb($number, $timeZone = null, $format = null)
    {
        Log::debug('Date from DB: ' . $number);
        if ($format === null) {
            $format = self::TIME_FORMAT;
        }
        if ($number === null) {
            return null;
        }
        if ($timeZone === null) {
            $timeZone = UUID::CLIENT_TIMEZONE;
        }
        $d = \DateTime::createFromFormat(self::DATABASE_TIME_FORMAT, $number, new \DateTimeZone('UTC'));
        if ($d === false) {
            $bc = $number[0] === '-';
            if ($bc) {
                $number = substr($number, 1);
            }

            $number = str_pad($number, 14, '0', STR_PAD_LEFT);
            if ($bc) { // Sorting correction for BC dates
                $number = self::_correctBeforeBC($number);
            }
            $milleniums = (string)(int)substr($number, 0, -13);
            $smallNumber = '1' . substr($number, -13);
            $d = \DateTime::createFromFormat(self::DATABASE_TIME_FORMAT, $smallNumber, new \DateTimeZone('UTC'));
            try {
                return ($bc ? '-' : '') . $milleniums . substr($d->format(self::TIME_FORMAT), 1);
            } catch (\Throwable $e) {
                throw new \RuntimeException("Failed to transform value  {$number} ({$smallNumber}) to date", 0, $e);
            }
        }
        $d->setTimezone($timeZone === null ? null : new \DateTimeZone($timeZone));
        return $d->format($format);
    }

    public function startDate($format = 'Y-m-d')
    {
        return self::dateFromDb($this->start, null, $format);
    }

    public function endDate($format = 'Y-m-d')
    {
        return self::dateFromDb($this->end, null, $format);
    }

    /**
     * @param $number
     * @return string
     */
    protected static function _correctBeforeBC($number): string
    {
        $dayInverted = 235959 - abs(substr($number, -6));
        return substr($number, 0, -6) . str_pad($dayInverted, 6, '0', STR_PAD_LEFT);
    }

    public function symlinkToThumb($otherThingId)
    {
        $linkName = $this->getThumbLocalPath();
        @unlink($linkName);
        /** @noinspection MkdirRaceConditionInspection */
        @mkdir(dirname($linkName), 0775, true);
        symlink('../../..' . self::getThumbPathById($otherThingId, true), $linkName);
    }

    /**
     * @param bool $addSlash
     * @return string
     */
    public function getThumbPath($addSlash = true): string
    {
        return self::getThumbPathById($this->thing_id, $addSlash);
    }

    /**
     * @return string
     */
    public function getThumbLocalPath(): string
    {
        return self::getThumbPathById($this->thing_id, false);
    }

    /**
     * @return string
     */
    public function getThumbWebPath(): string
    {
        return self::getThumbPathById($this->thing_id, true);
    }

    /**
     * @param $thingId
     * @param bool $webLink
     * @return string
     */
    public static function getThumbPathById($thingId, $webLink = true): string
    {
        $first = substr($thingId, 0, 1);
        $second = substr($thingId, 1, 1);
        //return $first . $second . $thingId . '.jpg';
        return ($webLink ? DIRECTORY_SEPARATOR : ('public' . DIRECTORY_SEPARATOR)) . 'thumbs' . DIRECTORY_SEPARATOR . $first . DIRECTORY_SEPARATOR . $second . DIRECTORY_SEPARATOR . $thingId . '.jpg';
    }

    public static function echoDateWithVariety($object, $type = 'start')
    {
        if ($type === 'end') {
            $dateName = 'end_date';
            $varietyName = 'end_variety';
        } else {
            $dateName = 'start_date';
            $varietyName = 'start_variety';
        }
        $date = $object->$dateName;
        if (empty($object->$varietyName)) {
            echo $date;
        } elseif ($object->$varietyName < 10000) {  // @todo  make it more exact
            echo $date;
        } elseif ($object->$varietyName < 240000) {
            echo $date . ' (+1 hour)';
        } elseif ($object->$varietyName < 31000000) {
            [$date] = explode(' ', $date);
            echo $date . ' (+1 day)';
        } elseif ($object->$varietyName <= 10000000000) {
            [$date] = explode('-', $date);
            echo $date . " (+1 year)";
        } else {
            $years = floor($object->$varietyName / 10000000000);
            [$date] = explode('-', $date);
            echo $date . " (+$years years)";
        }
    }

    public function createWithLinks()
    {
        $this->_validateAdditionalParameters();
        $this->save();
    }

    public function getView()
    {
        return static::convertFromRaw($this->_data);
    }

    /**
     * Returns Name => Value pairs to be displayed in object view.
     * An be redefined is child classes
     */
    public function getObjectViewProperties()
    {

    }

    public function _getThingsProperties()
    {
        return [
            'Description' => $this->description,
            'Class'       => '',
        ];
    }

    /**
     * This to be redefined in child classes that need to show additional information on object view page.
     * For example
     *
     * @return array
     */
    public function getSpecificData()
    {
        return [];
    }


}
