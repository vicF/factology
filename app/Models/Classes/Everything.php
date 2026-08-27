<?php
/**
 * facts1
 * User: fokin
 * Created: 07/10/2019
 */

namespace App\Models\Classes;

use App\Eloquent\Link;
use App\Eloquent\Thing;
use App\Services\GeoProperties;
use App\Services\RelatedObjectsResolver;
use Fokin\Facts\Data\FieldLanguage;
use Fokin\Facts\Data\UUID;
use InvalidArgumentException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Arr;
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
 * @method Everything thing_id($thing_id)
 * @method Everything name($name)
 * @method Everything description($description)
 * @method Everything start($start)
 * @method Everything end($end)
 */
class Everything
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
        'SERVER'   => UUID::G_SERVER,
    ];

    public const TIME_FORMAT = 'Y-m-d H:i:s';
    public const DATABASE_TIME_FORMAT = 'YmdHis';

    /** Link date columns persisted by addLink/updateLink when present. */
    public const LINK_DATE_FIELDS = [
        'link_start',
        'link_end',
        'link_start_meta',
        'link_end_meta',
    ];

    public string $template = 'partials.object.view.main.properties';
    public string $additional_template = ''; //'partials.object.view.additional.properties';

    protected array $_data = [];
    protected $_eloquentModel;
    protected $_classes;
    protected $_tableFields = [
        'deleted',
        'description',
        'description_translations',
        'data',
        'end',
        'end_meta',
        'name',
        'name_translations',
        'public',
        'start',
        'start_meta',
        'thing_id',
        'type',
        'owner',
        'server_uuid',
    ];

    protected static ?string $_serverUuid = null;

    public $params = [
        'deleted',
        'description',
        'description_translations',
        'data',
        'end',
        'end_date',
        'end_meta',
        'name',
        'name_translations',
        'public',
        'record_created',
        'record_updated',
        'start',
        'start_date',
        'start_meta',
        'thing_id',
        'type',
        'owner',
        'server_uuid',
    ];
    public $defaults = ['end' => null, 'public' => 0];
    public $additionalParams = [];

    /**
     * Anything constructor.
     *
     * @param array|null $data
     * @param Everything|null $class
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
            $data['class'] = $this->getObjectNameByUid($data['class']);
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
     * All classes an object belongs to (multi-class support), each with the
     * data needed by the frontend badges: thing_id, name, translations and the
     * PHP class_name (for model dispatch). Order follows the LINK_TO_CLASS
     * link insertion order — the first entry is the object's primary class.
     *
     * @param string $id object thing_id
     * @return array
     */
    public static function getClassesWithNames($id): array
    {
        return DB::table('links')
            ->join('things as c', 'c.thing_id', '=', 'links.other_thing_id')
            ->leftJoin('classes', 'classes.thing_id', '=', 'c.thing_id')
            ->where('links.one_thing_id', $id)
            ->where('links.link_type_id', UUID::LINK_TO_CLASS)
            ->where('links.deleted', false)
            ->where('c.deleted', false)
            // Deterministic insertion order → the first-created class link is
            // the object's primary class.
            ->orderBy('links.link_id')
            ->select('c.thing_id', 'c.name', 'c.name_translations', 'classes.class_name')
            ->get()
            ->map(function ($r) {
                return [
                    'thing_id'          => $r->thing_id,
                    'name'              => $r->name,
                    'name_translations' => is_string($r->name_translations)
                        ? json_decode($r->name_translations, true)
                        : ($r->name_translations ?? null),
                    'class_name'        => $r->class_name,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @param $id
     * @return string
     */
    public static function getClassNameFromClassdata($classData)
    {
        return '\\App\\Models\\Classes\\' . ($classData?->class_name ?? 'Everything');
    }

    /**
     * @param $id
     * @return Everything
     */
    public static function CreateFromId($id)
    {
        LOG::debug('Creating object from id: ' . $id);
        $class = self::getClassDataByObjectId($id);
        $className = self::getClassNameFromClassdata($class); //'\\App\\Models\\Classes\\' . ($class->class_name ?? 'Anything');
        try {
            return new $className(['thing_id' => $id], $class);
            /** @var Everything $className */
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
    public static function getDataById($id, int $depth = 0): array
    {
        LOG::debug('retrieving object data for id: ' . $id);
        $class = self::getClassDataByObjectId($id);
        $className = self::getClassNameFromClassdata($class); //'\\App\\Models\\Classes\\' . ($class->class_name ?? 'Anything');

        try {
            /** @var Everything $className */
            return $className::getClassSpecificDataById($id, $class, $depth);

            /*$thing = $className::_getRow($id)->first();
            // Keep date in db format to be able to compare
            return $className::CreateFromData(self::convertToArray($thing));*/
        } catch (ModelNotFoundException $e) {
            abort(404);
            //throw new \RuntimeException('No object with uuid=' . $id, 404, $e);
        }
    }

    public static function getClassSpecificDataById($id, $class, int $depth = 0): array
    {
        $thing = (array)static::_getRow($id)->first();
        if (empty($thing)) {
            abort(404, 'Authorization required to access this resource');
        }

        // Convert binary/resource values to strings (e.g. phash bytea from PostgreSQL)
        foreach ($thing as $key => $value) {
            if (is_resource($value)) {
                $thing[$key] = stream_get_contents($value);
            }
        }

        // Decode JSON columns from PostgreSQL (query builder returns them as strings)
        foreach (['data', 'name_translations', 'description_translations', 'start_meta', 'end_meta'] as $jsonField) {
            if (isset($thing[$jsonField]) && is_string($thing[$jsonField])) {
                $thing[$jsonField] = json_decode($thing[$jsonField], true);
            }
        }

        // Legacy objects may store data.properties as a list (old format); the
        // property map must be an object (thing_id => value) so clients can
        // attach values by property id. An empty list normalizes to an empty object.
        if (isset($thing['data']['properties']) && $thing['data']['properties'] === []) {
            $thing['data']['properties'] = new \stdClass();
        }

        // Geographic coordinates carried by the object's properties (by value shape).
        $thing['geo'] = GeoProperties::extract(
            isset($thing['data']['properties']) && is_array($thing['data']['properties'])
                ? $thing['data']['properties']
                : null
        );

        // Clean up class object: extract just relevant info, excluding heavy json from c.data.
        // An object may belong to several classes (multi-class) — expose them all
        // via `classes`, keeping `class` as the first/primary one for callers that
        // still consume the singular shape.
        $thing['classes'] = self::getClassesWithNames($id);
        $thing['class']   = $thing['classes'][0] ?? null;

        // Resolve the owner's display name (owner references a things.thing_id)
        $thing['owner_name'] = null;
        if (!empty($thing['owner'])) {
            $thing['owner_name'] = DB::table('things')->where('thing_id', $thing['owner'])->value('name');
        }

        // Both endpoint names are exposed with a single contract so the
        // frontend can render either direction without knowing which endpoint
        // is the current object: `name` is always other_thing_id's name and
        // `one_name` always one_thing_id's name (same as ApiController::search).
        $first = DB::table('links') // One way links
        ->where('links.one_thing_id', $thing['thing_id'])
            ->whereNot('link_type_id', UUID::LINK_TO_CLASS) // Exclude class link from all links
            ->leftJoin('things as other_thing', 'links.other_thing_id', '=', 'other_thing.thing_id')
            ->leftJoin('things as link_types', 'links.link_type_id', '=', 'link_types.thing_id')
            ->leftJoin('things as one_thing', 'links.one_thing_id', '=', 'one_thing.thing_id')
            ->select('links.*', 'other_thing.name', 'link_types.name as link_name', 'one_thing.name as one_name')
            ->addSelect('link_types.name_translations as link_name_translations')
            ->addSelect('other_thing.public as target_public')
            ->addSelect('other_thing.name_translations')
            ->addSelect('one_thing.name_translations as one_name_translations')
            ->limit(50);

        $second = DB::table('links') // other way links
        ->where('links.other_thing_id', $thing['thing_id'])
            ->leftJoin('things as one_thing', 'links.one_thing_id', '=', 'one_thing.thing_id')
            ->leftJoin('things as link_types', 'links.link_type_id', '=', 'link_types.thing_id')
            ->leftJoin('things as other_thing', 'links.other_thing_id', '=', 'other_thing.thing_id')
            ->select('links.*', 'other_thing.name', 'link_types.name as link_name', 'one_thing.name as one_name')
            ->addSelect('link_types.name_translations as link_name_translations')
            ->addSelect('one_thing.public as target_public')
            ->addSelect('other_thing.name_translations')
            ->addSelect('one_thing.name_translations as one_name_translations')
            ->limit(50);

        // Only filter linked objects by visibility for non-admin users
        if (!Auth::check() || !Auth::user()->is_admin) {
            $first->where(function ($q) {
                $q->where('other_thing.public', 1)
                    ->orWhereNull('other_thing.public');
                if (Auth::check()) {
                    $q->orWhere('other_thing.owner', Auth::user()->thing_id);
                }
            });
            $second->where(function ($q) {
                $q->where('one_thing.public', 1)
                    ->orWhereNull('one_thing.public');
                if (Auth::check()) {
                    $q->orWhere('one_thing.owner', Auth::user()->thing_id);
                }
            });
        }

        $thing['links'] = $first
            ->union($second)
            ->orderBy('link_start')
            ->get()
            ->map(function ($link) {
                // Decode the flexible-date meta JSON the same way as the thing columns.
                foreach (['link_start_meta', 'link_end_meta'] as $metaField) {
                    if (isset($link->{$metaField}) && is_string($link->{$metaField})) {
                        $link->{$metaField} = json_decode($link->{$metaField}, true);
                    }
                }
                return $link;
            })
            ->values()
            ->toArray();

        // Decode the link type's translations (jsonb comes back as a string).
        foreach ($thing['links'] as &$flatLink) {
            if (isset($flatLink->link_name_translations) && is_string($flatLink->link_name_translations)) {
                $decoded = json_decode($flatLink->link_name_translations, true);
                $flatLink->link_name_translations = $decoded ?: null;
            }
            if (isset($flatLink->name_translations) && is_string($flatLink->name_translations)) {
                $decoded = json_decode($flatLink->name_translations, true);
                $flatLink->name_translations = $decoded ?: null;
            }
            if (isset($flatLink->one_name_translations) && is_string($flatLink->one_name_translations)) {
                $decoded = json_decode($flatLink->one_name_translations, true);
                $flatLink->one_name_translations = $decoded ?: null;
            }
        }
        unset($flatLink);

        // Multilevel related objects: when a depth is requested, resolve the
        // nested tree of related objects and attach a `target` (with nested
        // `target.links` at deeper levels) onto the matching flat link rows.
        // Additive only — the flat fields above are untouched, so existing
        // consumers (edit form, links section) keep working unchanged.
        if ($depth > 0 && !empty($thing['links'])) {
            $related = (new RelatedObjectsResolver)->forObject($id, $depth, RelatedObjectsResolver::BREADTH_CAP);
            $relatedByLinkId = [];
            foreach ($related as $rel) {
                $relatedByLinkId[$rel['link_id']] = $rel['target'];
            }
            foreach ($thing['links'] as &$link) {
                if (isset($relatedByLinkId[$link->link_id])) {
                    $link->target = $relatedByLinkId[$link->link_id];
                }
            }
            unset($link);
        }

        // Annotations pointing to URLs instead of internal objects.
        // The whole list is returned; the frontend diffs it on save.
        $thing['external_links'] = DB::table('external_links')
            ->where('thing_id', $thing['thing_id'])
            ->get()
            ->toArray();
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
    public static function CreateFromData(array $ObjectData, $class = null): static
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
                // Object has dates  in both user format and database format. Setting one initiates another.
                // @TODO may be this is not needed anymore. Expect to send dates in database format to the client and receive the same FACT-1
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
        } else if (!in_array((int)$this->type, [UUID::G_CLASS, UUID::G_LINK, UUID::G_THING, UUID::GENERAL, UUID::G_EXTERNAL, UUID::G_SERVER], true)) {
            $errors[] = 'Unknown type: ' . $this->type;
        }
        if (count($errors) === 0) {
            return true;
        }
        throw new \RuntimeException(print_r($errors, 1));
    }

    /**
     * @throws \Exception
     */
    public function save()
    {
        $existingRecord = DB::table('things')
            ->where('thing_id', $this->thing_id)
            ->first();

        // Check ownership — admins may save/reassign any object (system ownership, re-owning).
        // Guarded so internal flows without an auth user (e.g. UserClass seeding) still work.
        // System default owners (VICTOR_FOKIN, SYSTEM_OWNER) are treated as unowned — any
        // authenticated user may claim them.
        $authUser = auth()->user();
        $isAdmin = $authUser ? (bool) $authUser->is_admin : false;
        $isSystemDefault = $existingRecord && in_array($existingRecord->owner, [
            UUID::VICTOR_FOKIN, UUID::SYSTEM_OWNER,
        ], true);
        if (!empty($existingRecord) && !$isAdmin && $authUser && !$isSystemDefault && $existingRecord->owner != $authUser->thing_id) {
            throw new \Exception('You do not have permission to update this record', 403);
            // Or return response with 403 Forbidden status
        } elseif (empty($this->owner)) {
            if ($authUser) {
                $this->owner = $authUser->thing_id;
            }
        }
        $this->_validate();
        // Auto-set server_uuid for objects created on this server
        if (empty($this->server_uuid)) {
            if (self::$_serverUuid === null) {
                self::$_serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');
            }
            $this->server_uuid = self::$_serverUuid;
        }
        //$this->_eloquentModel = new Thing($this->_data); // @TODO Do we need eloquent here???
        $data = array_intersect_key($this->_data, array_flip($this->_tableFields));

        // Localization JSON columns (json/jsonb): encode arrays/objects into JSON strings,
        // storing null for empty structures so the column stays `null` rather than `[]`.
        // Guard: if a client sends translations without a `lang` key, default it from
        // the corresponding plain field's script (so lang-less data is never persisted).
        foreach (['name_translations' => 'name', 'description_translations' => 'description'] as $jsonField => $plainField) {
            if (array_key_exists($jsonField, $data)
                && is_array($data[$jsonField])
                && count($data[$jsonField]) > 0
                && !array_key_exists('lang', $data[$jsonField])) {
                $data[$jsonField]['lang'] = FieldLanguage::detect($data[$plainField] ?? null);
            }
        }
        foreach (['data', 'name_translations', 'description_translations', 'start_meta', 'end_meta'] as $jsonField) {
            if (array_key_exists($jsonField, $data)) {
                $value = $data[$jsonField];
                if (is_array($value) || is_object($value)) {
                    $encoded = json_encode($value);
                    $data[$jsonField] = ($encoded === '[]' || $encoded === '{}') ? null : $encoded;
                }
            }
        }

        if (empty($this->thing_id)) {
            // generating new UUID for the object
            $data['thing_id'] = $this->thing_id = (string)Str::uuid();
            /*$this->_eloquentModel->exists = false;
            $this->_eloquentModel->fill($this->_data);*/
            DB::table('things')->insert($data);
        } else {
            //unset($data->thing_id);
            //DB::table('things')->where('thing_id', $this->thing_id)->update($data);
            // Prepare data for upsert
            $upsertData = [
                'thing_id'       => $data['thing_id'],
                'name'           => $data['name'] ?? null,
                'description'    => $data['description'] ?? null,
                'public'         => $data['public'] ?? 0,
                'start'          => $data['start'] ?? null,
                'end'            => $data['end'] ?? null,
                'type'           => $data['type'],
                'owner'          => $data['owner'],
                'server_uuid'    => $data['server_uuid'] ?? self::$_serverUuid,
                'record_updated' => now(),
            ];

            // Localization JSON columns are only written when present in the request,
            // so an update that omits them never wipes existing translations/data.
            foreach (['data', 'name_translations', 'description_translations', 'start_meta', 'end_meta'] as $jsonField) {
                if (array_key_exists($jsonField, $data)) {
                    $upsertData[$jsonField] = $data[$jsonField];
                }
            }

            // Perform upsert
            DB::table('things')->upsert(
                [$upsertData], // Array of records to insert/update
                ['thing_id'], // Unique key(s) to check for conflicts
                array_keys(Arr::except($upsertData, ['thing_id', 'created_at'])) // Columns to update on conflict
            );
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

    public function setClass(array $classLink): bool
    {
        $classLink['link_type_id'] = UUID::LINK_TO_CLASS;
        return $this->setLink($classLink);
    }

    /**
     * Replace the object's class membership with the given list (multi-class).
     * Each entry is a LINK_TO_CLASS link payload; entries already linked (by
     * link_id or by endpoint pair) are updated/reused, and LINK_TO_CLASS links
     * that are no longer desired are soft-deleted. Non-class links are never
     * touched.
     *
     * @param array $classLinks
     * @return void
     */
    public function setClasses(array $classLinks): void
    {
        $desired = [];
        foreach ($classLinks as $classLink) {
            if (empty($classLink['other_thing_id'])) {
                continue;
            }
            // A class-membership link always originates from the object being
            // saved — normalize one_thing_id so a stale/missing client value
            // never creates a link from the wrong object.
            $classLink['one_thing_id'] = $this->thing_id;
            $classLink['link_type_id'] = UUID::LINK_TO_CLASS;
            $this->setLink($classLink);
            $desired[$classLink['other_thing_id']] = true;
        }
        // Invalidate the cached class list so the diff below reads fresh data.
        $this->_classes = null;
        // Diff: soft-delete class links the caller no longer wants (edit flow).
        foreach ($this->getClassesIds() as $existingClassId) {
            if (isset($desired[$existingClassId])) {
                continue;
            }
            DB::table('links')
                ->where('one_thing_id', $this->thing_id)
                ->where('link_type_id', UUID::LINK_TO_CLASS)
                ->where('other_thing_id', $existingClassId)
                ->where('deleted', false)
                ->update(['deleted' => true]);
        }
    }

    public function setParent(array $classLink): bool
    {
        $classLink['link_type_id'] = UUID::LINK_TO_PARENT;
        return $this->setLink($classLink);
    }

    public function setLink(array $link): bool
    {
        if (@$link['link_id']) {
            // update
            return $this->updateLink($link);
        } else {
            return $this->addLink($link);
        }
    }

    public function updateLink($link): int
    {
        $this->assertParentKindConsistent($link);
        $update = [
            'one_thing_id'   => $link['one_thing_id'],
            'link_type_id'   => $link['link_type_id'],
            'other_thing_id' => $link['other_thing_id'],
        ];
        if (array_key_exists('description', $link)) {
            $update['description'] = $link['description'];
        }
        foreach (self::LINK_DATE_FIELDS as $field) {
            if (array_key_exists($field, $link) && $link[$field] !== null && $link[$field] !== '') {
                $update[$field] = is_array($link[$field]) ? json_encode($link[$field]) : $link[$field];
            }
        }
        return DB::table('links')
            ->where('link_id', $link['link_id'])
            ->update($update);
    }

    public function addLink(array $link): bool
    {
        // Ensure that both ids are in place
        if(empty($link['one_thing_id']) && empty($link['other_thing_id'])) {
            throw new InvalidArgumentException('Link object ids (one_thing_id, other_thing_id) are empty ');
        } elseif(empty($link['one_thing_id']) && $link['other_thing_id'] != $this->thing_id) {
            $link['one_thing_id'] = $this->thing_id;
        } elseif (empty($link['other_thing_id']) && $link['one_thing_id'] != $this->thing_id) {
            $link['other_thing_id'] = $this->thing_id;
        }

        // Abstract link types are grouping containers, never real relations.
        if (!empty($link['link_type_id'])
            && DB::table('things')->where('thing_id', $link['link_type_id'])->value('abstract')) {
            throw new InvalidArgumentException("Link type {$link['link_type_id']} is abstract and cannot be used to create a link");
        }

        $this->assertParentKindConsistent($link);

        // Check if link already exists by unique constraint — the endpoint pair
        // is matched in EITHER direction, so adding the reverse of an existing
        // link reuses that row instead of creating a duplicate.
        $existing = DB::table('links')
            ->where('link_type_id', $link['link_type_id'])
            ->where(function ($query) use ($link) {
                $query->where('one_thing_id', $link['one_thing_id'])
                    ->where('other_thing_id', $link['other_thing_id'])
                    ->orWhere(function ($query) use ($link) {
                        $query->where('one_thing_id', $link['other_thing_id'])
                            ->where('other_thing_id', $link['one_thing_id']);
                    });
            })
            ->first();

        if ($existing) {
            // Update existing — preserve link_uuid. Description (if provided)
            // applies regardless of direction. A soft-deleted row is resurrected
            // (the unique index only covers non-deleted rows, so re-adding a
            // removed class/link would otherwise leave a stale deleted row).
            $existingUpdate = [];
            if ((bool) $existing->deleted) {
                $existingUpdate['deleted'] = false;
            }
            if (array_key_exists('description', $link)) {
                $existingUpdate['description'] = $link['description'];
            }
            if ($existingUpdate) {
                return DB::table('links')
                    ->where('link_id', $existing->link_id)
                    ->update($existingUpdate) > 0;
            }
            return true;
        }

        // Insert new link with generated UUID
        $insert = [
            'link_uuid'     => (string) \Illuminate\Support\Str::uuid(),
            'one_thing_id'  => $link['one_thing_id'],
            'link_type_id'  => $link['link_type_id'],
            'other_thing_id'=> $link['other_thing_id'],
        ];
        if (array_key_exists('description', $link)) {
            $insert['description'] = $link['description'];
        }
        foreach (self::LINK_DATE_FIELDS as $field) {
            if (array_key_exists($field, $link) && $link[$field] !== null && $link[$field] !== '') {
                $insert[$field] = is_array($link[$field]) ? json_encode($link[$field]) : $link[$field];
            }
        }
        return DB::table('links')->insert($insert);
    }

    /**
     * The class hierarchy (under Everything/Something) and the link taxonomy
     * (under Link) are two separate trees. A "is a superclass of" edge may only
     * connect nodes of the same kind — a class/thing cannot hang under a link
     * type, and a link type cannot hang under a class. The only exceptions are
     * the structural roots that host the other kind by design (Everything hosts
     * the Link taxonomy root; System hosts system-internal link types).
     *
     * @throws \InvalidArgumentException
     */
    private function assertParentKindConsistent(array $link): void
    {
        if (($link['link_type_id'] ?? null) !== UUID::LINK_TO_PARENT) {
            return;
        }
        $parentId = $link['one_thing_id'] ?? null;
        $childId  = $link['other_thing_id'] ?? null;
        if (empty($parentId) || empty($childId)) {
            return; // partial link — normalized by the caller
        }

        $types = DB::table('things')
            ->whereIn('thing_id', [$parentId, $childId])
            ->pluck('type', 'thing_id');
        if ($types->count() < 2) {
            return; // an endpoint is not in the DB yet — let the insert fail naturally
        }

        $parentIsLink = (int) $types[$parentId] === UUID::G_LINK;
        $childIsLink  = (int) $types[$childId] === UUID::G_LINK;
        if ($parentIsLink === $childIsLink) {
            return; // same kind — fine
        }
        if (in_array($parentId, [UUID::EVERYTHING, UUID::SYSTEM], true)) {
            return; // structural roots may host the other kind
        }

        $kind = fn (bool $isLink) => $isLink ? 'link type' : 'class';
        throw new InvalidArgumentException(
            "Cannot set a {$kind($parentIsLink)} as the parent of a {$kind($childIsLink)} — "
            . 'classes and link types form separate trees.'
        );
    }

    public function setAsChildOf($parentClass): bool
    {
        $parentName = Thing::find($parentClass)->name;
        return $this->setLink(UUID::LINK_TO_PARENT, $parentClass, "\"{$this->name}\" is child of \"{$parentName}\"");
    }


    public function getObjectNameByUid($uid)
    {
        return DB::table('things')
            ->select('thing_id', 'name')
            ->where('thing_id', $uid)
            ->first();
    }

    public function getExternalLinks()
    {
        $query = DB::table('external_links')->where('thing_id', $this->thing_id);
        $res = $query->get()->toArray();
        if (empty($res)) {
            $res = [];
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
     * Save the full desired list of external links for this object.
     * Diffes against the currently stored rows: inserts new ones,
     * updates ones with an id, deletes ones not present in the list.
     *
     * @param array $input expects ['elink' => [['id' => ?, 'url' => ?], ...]]
     */
    public function saveExternalLinks($input)
    {
        if (!array_key_exists('elink', $input) || !is_array($input['elink'])) {
            return;
        }
        $oldLinks = collect($this->getExternalLinks())->keyBy('id')->toArray();
        foreach ($input['elink'] as $link) {
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
            ->where('link_type_id', UUID::LINK_TO_PARENT)
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
        if ($number === null || $number === '') {
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
