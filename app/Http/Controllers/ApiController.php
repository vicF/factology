<?php

namespace App\Http\Controllers;

use App\Http\Requests\SearchRequest;
use App\Http\Resources\LinkResource;
use App\Http\Resources\ThingResource;
use App\Models\Classes\Media;
use App\Services\RelatedObjectsResolver;
use App\Models\Classes\MediaFile;
use App\Models\Classes\Everything;
use Fokin\Facts\Data\Era;
use Fokin\Facts\Data\FlexibleDate;
use Fokin\Facts\Data\UUID;
use Fokin\PhotoFacts\Models\Photos;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ApiController extends BaseController
{
    /**
     * List objects
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function list()
    {
        return response()->json(
            [
                'data'    => DB::table('things')->limit(100)->get(),
                'success' => true
            ]);
    }

    /**
     * Get object
     *
     *
     * @param $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function get($id, Request $request)
    {
        try {
            $depth = (int) $request->query('depth', 0);
            $depth = min(max($depth, 0), RelatedObjectsResolver::DETAIL_DEPTH_CAP);
            $data = Everything::getDataById($id, $depth);
            return response()->json(
                [
                    'data'    => $data,
                    'success' => true
                ]);
        } catch (\InvalidArgumentException $e) {
            Log::error('JSON encode failed for object ' . $id . ': ' . $e->getMessage());
            return response()->json(
                [
                    'success' => false,
                    'message' => 'Failed to serialize object data'
                ], 500);
        }
    }

    /**
     * Properties suggested for a class: things P linked to the class via a
     * PROPERTY_APPLIES_TO link ("is a property of class"), plus properties
     * linked to any ancestor class whose own `inherited` flag (data.inherited,
     * default true) allows propagation. Used by the edit form to offer fields
     * (e.g. Coordinates) for objects of that class.
     *
     * @param string $id class thing_id
     * @return \Illuminate\Http\JsonResponse
     */
    public function classProperties($id)
    {
        // Walk up the LINK_TO_PARENT chain to collect the class + ancestors.
        $classIds = [];
        $queue = [$id];
        $visited = [];
        while ($queue && count($visited) < 20) {
            $cid = array_shift($queue);
            if (isset($visited[$cid])) {
                continue;
            }
            $visited[$cid] = true;
            $classIds[] = $cid;
            // Hierarchy convention: one_thing_id = parent/superclass,
            // other_thing_id = child/subclass — so a class's parents are links
            // where other_thing_id = this class.
            $parents = DB::table('links')
                ->where('other_thing_id', $cid)
                ->where('link_type_id', UUID::LINK_TO_PARENT)
                ->where('deleted', false)
                ->pluck('one_thing_id');
            foreach ($parents as $parent) {
                if (!isset($visited[$parent])) {
                    $queue[] = $parent;
                }
            }
        }

        // Property ids directly linked to the class (always apply).
        $directIds = array_flip(DB::table('links')
            ->where('link_type_id', UUID::PROPERTY_APPLIES_TO)
            ->where('other_thing_id', $id)
            ->where('deleted', false)
            ->pluck('one_thing_id')
            ->all());

        $rows = DB::table('links as l')
            ->join('things as t', 't.thing_id', '=', 'l.one_thing_id')
            ->where('l.link_type_id', UUID::PROPERTY_APPLIES_TO)
            ->whereIn('l.other_thing_id', $classIds)
            ->where('l.deleted', false)
            ->where('t.deleted', false)
            ->select('t.thing_id', 't.name', 't.name_translations', 't.data')
            ->get();

        $properties = [];
        foreach ($rows as $row) {
            $propId = $row->thing_id;
            if (isset($properties[$propId])) {
                continue;
            }
            $data = $row->data ?? null;
            if (is_string($data)) {
                $data = json_decode($data, true);
            }
            $inherited = !is_array($data) || !array_key_exists('inherited', $data)
                ? true
                : (bool) $data['inherited'];
            // Directly linked properties always apply; ancestor-linked ones only
            // when the property's own inherited flag allows it.
            if (!isset($directIds[$propId]) && !$inherited) {
                continue;
            }
            $translations = $row->name_translations ?? null;
            if (is_string($translations)) {
                $translations = json_decode($translations, true) ?: null;
            }
            $properties[$propId] = [
                'thing_id'          => $propId,
                'name'              => $row->name ?? null,
                'name_translations' => $translations,
                'inherited'         => (bool) $inherited,
            ];
        }

        return response()->json(
            [
                'data'    => array_values($properties),
                'success' => true
            ]);
    }

    /**
     * All property definitions in the system (things of class Property) —
     * for the edit form's "Add property" picker.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function properties()
    {
        $properties = DB::table('links as l')
            ->join('things as t', 't.thing_id', '=', 'l.one_thing_id')
            ->where('l.link_type_id', UUID::LINK_TO_CLASS)
            ->where('l.other_thing_id', UUID::PROPERTY_CLASS)
            ->where('l.deleted', false)
            ->where('t.deleted', false)
            ->select('t.thing_id', 't.name', 't.name_translations')
            ->get()
            ->map(function ($row) {
                $translations = $row->name_translations ?? null;
                if (is_string($translations)) {
                    $translations = json_decode($translations, true) ?: null;
                }
                return [
                    'thing_id'          => $row->thing_id,
                    'name'              => $row->name ?? null,
                    'name_translations' => $translations,
                ];
            })
            ->values();

        return response()->json(
            [
                'data'    => $properties,
                'success' => true
            ]);
    }

    /**
     * Forward geocoding proxy: address → list of { name, lat, lng }.
     *
     * Providers:
     *  - "nominatim" (default): OpenStreetMap's geocoder, free, no key. Called
     *    server-side with a proper User-Agent per its usage policy.
     *  - "yandex": better RU street-level coverage; requires
     *    YANDEX_GEOCODER_KEY env. Returns 501 when the key is not configured.
     *
     * @param  Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function geocode(Request $request)
    {
        $q = $request->query('q');
        $provider = $request->query('provider', 'nominatim');

        if (!is_string($q) || trim($q) === '' || mb_strlen($q) > 300) {
            return response()->json(['success' => false, 'message' => 'Query is required'], 422);
        }
        if (!in_array($provider, ['nominatim', 'yandex'], true)) {
            return response()->json(['success' => false, 'message' => 'Unknown geocoder provider'], 422);
        }
        if ($provider === 'yandex' && !config('services.yandex.geocoder_key')) {
            return response()->json(
                ['success' => false, 'message' => 'Yandex geocoder API key is not configured (YANDEX_GEOCODER_KEY)'],
                501
            );
        }

        try {
            $results = $provider === 'yandex'
                ? $this->geocodeYandex($q)
                : $this->geocodeNominatim($q);
        } catch (\Throwable $e) {
            Log::warning('geocode failed', ['provider' => $provider, 'q' => $q, 'error' => $e->getMessage()]);
            return response()->json(['success' => false, 'message' => 'Geocoding service unavailable'], 502);
        }

        return response()->json(['success' => true, 'data' => $results]);
    }

    private function geocodeNominatim(string $q): array
    {
        $res = Http::timeout(12)
            ->connectTimeout(8)
            ->withHeaders([
                'User-Agent' => 'factology/1.0 (local dev; https://factology.local)',
                'Accept-Language' => 'ru',
            ])
            ->get('https://nominatim.openstreetmap.org/search', [
                'format' => 'jsonv2',
                'q'      => $q,
                'limit'  => 5,
            ]);
        $res->throw();

        return collect($res->json())
            ->map(fn ($r) => [
                'name' => $r['display_name'] ?? $r['name'] ?? '?',
                'lat'  => (float) ($r['lat'] ?? 0),
                'lng'  => (float) ($r['lon'] ?? 0),
            ])
            ->values()
            ->all();
    }

    private function geocodeYandex(string $q): array
    {
        // The key is checked in geocode() before the try/catch, so this only
        // guards against a key being removed between the two calls.
        $key = config('services.yandex.geocoder_key');

        $res = Http::timeout(12)->connectTimeout(8)->get('https://geocode-maps.yandex.ru/1.x/', [
            'format'  => 'json',
            'geocode' => $q,
            'apikey'  => $key,
            'results' => 5,
            'lang'    => 'ru_RU',
        ]);
        $res->throw();

        $features = $res->json('response.GeoObjectCollection.featureMember') ?? [];

        return collect($features)
            ->map(function ($f) {
                $geo = $f['GeoObject'] ?? [];
                $pos = explode(' ', $geo['Point']['pos'] ?? ''); // "lng lat"
                return [
                    'name' => $geo['metaDataProperty']['GeocoderMetaData']['text'] ?? $geo['name'] ?? '?',
                    'lat'  => (float) ($pos[1] ?? 0),
                    'lng'  => (float) ($pos[0] ?? 0),
                ];
            })
            ->values()
            ->all();
    }


    /**
     * Store object
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        // Normalize raw date values to canonical form BEFORE validation so the
        // end>=start check compares chronologically-correct padded values
        // (a raw '20260817' would otherwise sort below canonical '20260811120000'
        // in bccomp) and no legacy-style unpadded digits re-enter the DB.
        $normalizedDates = [];
        foreach (['start', 'end'] as $dateField) {
            $raw = $request->input($dateField);
            if ($raw !== null && $raw !== '') {
                $normalizedDates[$dateField] = self::normalizeDateField($raw);
            }
        }
        if ($normalizedDates) {
            $request->merge($normalizedDates);
        }
        $validated = $request->validate([
            /**
             * UUID of the main object
             * @example "6c541c84-b7e2-41de-8f7c-20b8e6f516d4"
             */
            'thing_id' => ['required', 'string', 'uuid'],

            /**
             * Name of the object
             * @example "Гоблинский Пунш"
             */
            'name' => ['required', 'string', 'max:255'],

            /**
             * Description of the object
             * @example "Бар такой"
             */
            'description' => ['nullable', 'string', 'max:1000'],

            /**
             * Start date/time as numeric string: YYYYMMDDHHMMSS
             * @example 20260228111234
             */
            'start' => ['nullable', 'string', 'regex:/^-?\d*$/'],

            /**
             * End date/time as numeric string: YYYYMMDDHHMMSS
             * @example 20260228181234
             */
            'end' => [
                'nullable',
                'string',
                'regex:/^-?\d*$/',
                function ($attribute, $value, $fail) use ($request) {
                    if ($request->has('start') && $request->start !== null && bccomp($value, $request->start) < 0) {
                        $fail('The end date must be after the start date.');
                    }
                },
            ],

            /**
             * Flexible-date display metadata for the start/end bounds.
             * Shape: { qualifier, era, precision, alternatives: [...], comment }.
             */
            'start_meta' => ['nullable', 'array'],
            'start_meta.qualifier' => ['nullable', Rule::in(FlexibleDate::QUALIFIERS)],
            'start_meta.era' => ['nullable', Rule::in(Era::keys())],
            'start_meta.precision' => ['nullable', Rule::in(FlexibleDate::PRECISIONS)],
            'start_meta.alternatives' => ['nullable', 'array'],
            'start_meta.alternatives.*' => ['string', 'regex:/^-?\d*$/'],
            'start_meta.comment' => ['nullable', 'string', 'max:500'],

            'end_meta' => ['nullable', 'array'],
            'end_meta.qualifier' => ['nullable', Rule::in(FlexibleDate::QUALIFIERS)],
            'end_meta.era' => ['nullable', Rule::in(Era::keys())],
            'end_meta.precision' => ['nullable', Rule::in(FlexibleDate::PRECISIONS)],
            'end_meta.alternatives' => ['nullable', 'array'],
            'end_meta.alternatives.*' => ['string', 'regex:/^-?\d*$/'],
            'end_meta.comment' => ['nullable', 'string', 'max:500'],

            /**
             * Public flag (0 or 1)
             * @example 1
             */
            'public' => ['required', 'integer', 'in:0,1'],

            /**
             * Owner (thing UUID) — admins only. Lets an admin mark an object as
             * system-owned (owner = UUID::SYSTEM_OWNER) or reassign it.
             * @example "aaaaaaaa-0000-4000-a000-00000000000a"
             */
            'owner' => ['sometimes', 'string', 'uuid'],

            /**
             * UUID of parent object (if any)
             * @example null
             */
            'parent_id' => ['nullable', 'string', 'uuid'],

            /**
             * Type identifier
             * @example 3
             */
            'type' => ['required', 'integer', 'min:1', 'max:6'],

            /**
             * Class relationship data (optional)
             */
            'class' => ['sometimes', 'array'],

            /**
             * UUID of the first related object
             * @example "6c541c84-b7e2-41de-8f7c-20b8e6f516d4"
             */
            'class.one_thing_id' => ['required_with:class', 'string', 'uuid'],

            /**
             * UUID of the link type
             * @example "c217c185-742f-4a9f-8e69-acea2b4f5aea"
             */
            'class.link_type_id' => ['required_with:class', 'string', 'uuid'],

            /**
             * UUID of the other related object
             * @example "602f1b6b-1383-442b-908c-1a027d7a8010"
             */
            'class.other_thing_id' => ['required_with:class', 'string', 'uuid'],

            /**
             * Description of the relationship
             * @example null
             */
            'class.description' => ['nullable', 'string', 'max:1000'],

            /**
             * Public flag for the relationship
             * @example 1
             */
            'class.public' => ['nullable', 'integer', 'in:0,1'],

            /**
             * External links (annotations pointing to URLs).
             * Full desired list — the backend diffs it against existing rows.
             */
            'external_links' => ['nullable', 'array'],
            'external_links.*.id'  => ['nullable', 'string', 'uuid'],
            'external_links.*.url' => ['nullable', 'string', 'max:2048'],

            /**
             * Localized name variants: { "lang": <code of name's language>, <code>: <text>, ... }
             * @example {"lang":"ru","en":"island"}
             */
            'name_translations' => ['nullable', 'array'],

            /**
             * Localized description variants (same shape as name_translations)
             */
            'description_translations' => ['nullable', 'array'],

            /**
             * Object metadata: { "properties": { <propertyThingId>: <value> } }
             */
            'data' => ['nullable', 'array'],
            'data.properties' => ['nullable', 'array'],
        ]);

        // Only admins may change an object's owner (system ownership / reassignment).
        // Non-admins never send it — the model defaults to their own thing_id.
        if ($request->has('owner') && !Auth::user()->is_admin) {
            throw ValidationException::withMessages(['owner' => 'Only admins can change ownership.']);
        }

        return DB::transaction(static function () use ($request) {
            $model = new Everything($request->toArray());
            try {
                $model->save();
            } catch(\Throwable $e) {
                $statusCode = $e->getCode();
                if ($statusCode < 100 || $statusCode > 599) {
                    $statusCode = 500;
                }
                return response()->json([
                    'success' => false,
                    'message' => $e->getMessage() ?? 'Failed to save the record',
                    'errors' => $e->getMessage() ?? 'Unknown error occurred'
                ], $statusCode);
            }
            /*if ($request->parent_id) {

                $model->setParent([
                    'one_thing_id' => $request->parent_id,
                ]);
            }*/
            if ($request->parent) {
                $model->setParent($request->parent);
            }
            if ($request->class) {
                $model->setClass($request->class);
            }
            if (!empty($request['links'])) { // @TODO likely will not be used
                foreach ($request['links'] as $link) {
                    $model->setLink($link);
                }
            }
            if (!empty($request['links_to_add'])) {
                foreach ($request['links_to_add'] as $link) {
                    $model->addLink($link);
                }
            }
            if (!empty($request['links_to_update'])) {
                foreach ($request['links_to_update'] as $link) {
                    $model->updateLink($link);
                }
            }
            if (array_key_exists('external_links', $request->all())) {
                $model->saveExternalLinks(['elink' => $request->input('external_links', [])]);
            }
            return response()->json(
                [
                    'data'    => $model->toArray(),
                    'success' => true
                ]);
        });
    }

    /**
     * Normalize a raw date digit string to its canonical padded form
     * ('2026081112' → '20260811120000'). Canonical values (length ≥ 11:
     * variable year + exactly 10-digit MMDDHHMMSS tail) pass through, so the
     * flexible-date frontend (which always sends canonical values) is unaffected.
     */
    private static function normalizeDateField(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return $value;
        }
        if (strlen(ltrim($value, '-')) >= 11) {
            return $value;
        }
        $parsed = FlexibleDate::parse($value);
        return $parsed !== null && $parsed->value !== null ? $parsed->value : $value;
    }

    /**
     * Store link
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function storeLink(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->toArray();
        // The translation column no longer exists; ignore stale payloads.
        unset($data['translation']);
        // Flexible-date meta columns are jsonb: encode arrays to JSON strings.
        foreach (['link_start_meta', 'link_end_meta'] as $metaField) {
            if (isset($data[$metaField]) && is_array($data[$metaField])) {
                $data[$metaField] = json_encode($data[$metaField]);
            }
        }
        // Normalize raw link date values to canonical form.
        foreach (['link_start', 'link_end'] as $dateField) {
            if (isset($data[$dateField]) && $data[$dateField] !== null && $data[$dateField] !== '') {
                $data[$dateField] = self::normalizeDateField($data[$dateField]);
            }
        }
        // Abstract link types are grouping containers, never real relations.
        if (!empty($data['link_type_id'])
            && DB::table('things')->where('thing_id', $data['link_type_id'])->value('abstract')) {
            return response()->json([
                'success' => false,
                'message' => 'Abstract link types cannot be used to create a link',
                'errors'  => ['link_type_id' => 'This link type is abstract and only groups its children.'],
            ], 422);
        }
        // Classes and link types form two separate trees — a "is a superclass of"
        // edge may only connect same-kind endpoints (except the structural roots).
        if (($data['link_type_id'] ?? null) === UUID::LINK_TO_PARENT
            && !empty($data['one_thing_id'])
            && !empty($data['other_thing_id'])
            && !$this->isParentKindConsistent($data['one_thing_id'], $data['other_thing_id'])) {
            return response()->json([
                'success' => false,
                'message' => 'Classes and link types form separate trees — the parent must be of the same kind as the child.',
                'errors'  => ['other_thing_id' => 'Cannot set a class/link-type of the other kind as the parent.'],
            ], 422);
        }
        if(!empty($data['link_id'])) {
            DB::table('links')
                ->where('link_id', $data['link_id'])
                ->update($data);
        } else {
            // Prevent reversed duplicates: the endpoint pair is matched in EITHER
            // direction. If the same pair+type already exists, reuse that row
            // instead of inserting a new one.
            if (!empty($data['one_thing_id']) && !empty($data['other_thing_id']) && !empty($data['link_type_id'])) {
                $existing = DB::table('links')
                    ->where('link_type_id', $data['link_type_id'])
                    ->where(function ($query) use ($data) {
                        $query->where('one_thing_id', $data['one_thing_id'])
                            ->where('other_thing_id', $data['other_thing_id'])
                            ->orWhere(function ($query) use ($data) {
                                $query->where('one_thing_id', $data['other_thing_id'])
                                    ->where('other_thing_id', $data['one_thing_id']);
                            });
                    })
                    ->first();

                if ($existing) {
                    $sameDirection = $existing->one_thing_id === $data['one_thing_id']
                        && $existing->other_thing_id === $data['other_thing_id'];
                    if ($sameDirection && array_key_exists('description', $data)) {
                        DB::table('links')
                            ->where('link_id', $existing->link_id)
                            ->update(['description' => $data['description']]);
                    }
                    $data['link_id'] = $existing->link_id;
                    return response()->json(
                        [
                            'data'    => $data,
                            'success' => true
                        ]);
                }
            }
            // Generate link_uuid for stable export/import matching if not provided
            if (empty($data['link_uuid'])) {
                $data['link_uuid'] = (string) Str::uuid();
            }
            DB::table('links')
                ->insert($data);
        }
        return response()->json(
            [
                'data'    => $data,
                'success' => true
            ]);
    }

    /**
     * Whether a "is a superclass of" edge between $parentId and $childId keeps
     * the class/link-tree invariant: both endpoints must be the same kind (both
     * link types or both non-link), unless the parent is a structural root that
     * hosts the other kind by design (Everything → Link, System → system links).
     */
    private function isParentKindConsistent(string $parentId, string $childId): bool
    {
        $types = DB::table('things')
            ->whereIn('thing_id', [$parentId, $childId])
            ->pluck('type', 'thing_id');
        if ($types->count() < 2) {
            return true; // an endpoint is not in the DB yet — don't pre-empt a later failure
        }
        $parentIsLink = (int) $types[$parentId] === UUID::G_LINK;
        $childIsLink  = (int) $types[$childId] === UUID::G_LINK;
        if ($parentIsLink === $childIsLink) {
            return true;
        }
        return in_array($parentId, [UUID::EVERYTHING, UUID::SYSTEM], true);
    }

    /**
     * Upload file
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function upload(Request $request)
    {
        $stored = 0;
        Log::info('Received upload request');
        /** @noinspection PhpUndefinedFieldInspection */
        foreach ($request->uploaded_file as $file) {
            Log::info("Processing  file " . $file->getClientOriginalName());
            if ($file->isValid()) {
                // File UUID
                [$fileId] = explode('.', $file->getClientOriginalName());
                // Media UUID
                $mediaId = DB::table('photo_files')->where('file_thing_id', $fileId)->value('media_thing_id');
                $fileTarget = Media::getThumbPathById($fileId, false);
                $mediaTarget = Media::getThumbPathById($mediaId, false);
                // If Media thumb does not exist or different from
                if (!@mkdir($concurrentDirectory = dirname($mediaTarget), 0775, true) && !is_dir($concurrentDirectory)) {
                    throw new \RuntimeException(sprintf('Directory "%s" was not created', $concurrentDirectory));
                }
                if (!@mkdir($concurrentDirectory = dirname($fileTarget), 0775, true) && !is_dir($concurrentDirectory)) {
                    throw new \RuntimeException(sprintf('Directory "%s" was not created', $concurrentDirectory));
                }
                // At the start we replace media thumb everytime new file is uploaded. This make sence to fix some error thumbs created during development.
                // In the future it would probably be better to always keep original thumbnail.
                if (is_file($mediaTarget) || is_link($mediaTarget)) {
                    unlink($mediaTarget);
                }
                if (is_file($fileTarget) || is_link($fileTarget)) {
                    unlink($fileTarget);
                }
                $mediaTarget = getcwd() . '/' . $mediaTarget;
                $res = move_uploaded_file(
                    $file->getRealPath(),
                    $mediaTarget
                );
                ($MediaFile = MediaFile::createFromId($fileId))->symlinkToThumb($mediaId);
                //$path = $file->storeAs(public_path() . DIRECTORY_SEPARATOR . 'thumbs', $file->getClientOriginalName());
                if ($res) {
                    Log::info("Stored file " . $file->getClientOriginalName() . ' for media: ' . $MediaFile->name);
                    $stored++;
                }
            }
        }
        return response()->json(
            [
                'filesStored' => $stored,
                'success'     => true
            ]);
    }

    /**
     * Delete object
     *
     * @param $id
     * @return \Illuminate\Http\JsonResponse
     * @throws \Exception
     */
    public function delete($id)
    {
        $existing = DB::table('things')->where('thing_id', $id)->first();
        // Admins may delete any object; everyone else only their own.
        if (!$existing || (!auth()->user()->is_admin && $existing->owner !== auth()->user()->thing_id)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to delete this record',
            ], 403);
        }
        Everything::deleteById($id);
        return response()->json(['success' => true]);
    }

    /**
     * Toggle object visibility (public/private)
     *
     * Lightweight endpoint — only updates the `public` field.
     * Full object edit still requires PUT /object/{id}.
     *
     * @param \Illuminate\Http\Request $request
     * @param string $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function toggleVisibility(Request $request, string $id): \Illuminate\Http\JsonResponse
    {
        $validated = $request->validate([
            'public' => ['required', 'integer', 'in:0,1'],
        ]);

        $query = DB::table('things')->where('thing_id', $id);
        if (!auth()->user()->is_admin) {
            $query->where('owner', auth()->user()->thing_id);
        }
        $updated = $query->update([
            'public'         => $validated['public'],
            'record_updated' => now(),
        ]);

        if ($updated === 0) {
            return response()->json([
                'success' => false,
                'message' => 'Object not found or you do not have permission',
            ], 403);
        }

        return response()->json([
            'success' => true,
            'data'    => ['public' => (bool) $validated['public']],
        ]);
    }


    /**
     * Delete link
     *
     * @param \Illuminate\Http\Request $request
     * @param $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function deleteLink(Request $request, $id): \Illuminate\Http\JsonResponse
    {
        try {
            $deleted = DB::table('links')
                ->where('link_id', $id)
                ->delete();

            if ($deleted) {
                return response()->json(['message' => 'Link deleted successfully'], 200);
            }

            return response()->json(['message' => 'Link not found'], 404);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Failed to delete link', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Suggest objects commonly linked together via the same link type (across all users).
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function suggestLinks(Request $request)
    {
        $validated = $request->validate([
            'one_thing_id' => ['required', 'string', 'uuid'],
            'link_type_id' => ['required', 'string', 'uuid'],
            'limit'        => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $limit = $validated['limit'] ?? 12;

        $results = DB::table('links')
            ->select('other_thing_id', DB::raw('COUNT(*) as frequency'))
            ->where('link_type_id', $validated['link_type_id'])
            ->whereNotNull('other_thing_id')
            ->groupBy('other_thing_id')
            ->orderByDesc('frequency')
            ->limit($limit)
            ->get()
            ->pluck('other_thing_id');

        return response()->json([
            'data'    => $results,
            'success' => true,
        ]);
    }

    /**
     * Per-user "quick lists" for the object / link-type / class dropdowns.
     *
     * Returns the link types, things and classes this user uses most, derived
     * from links attached to objects they own. Short user lists are padded with
     * globally popular objects of the same type so a fresh user still gets a
     * useful dropdown. The client fetches this once at app load and seeds its
     * local history cache from it, so opening a dropdown makes no per-open
     * network request — the server is only hit when the user searches.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function suggestLists(Request $request): \Illuminate\Http\JsonResponse
    {
        $userThingId = Auth::user()->thing_id;
        $limit = 30;

        // Rank the values of $column by how often they appear in links whose
        // subject (one_thing_id) is an object owned by the current user.
        $rankOwned = function (string $column, bool $whereNotNull = false) use ($userThingId, $limit) {
            $query = DB::table('links as l')
                ->join('things as o', function ($join) use ($userThingId) {
                    $join->on('o.thing_id', '=', 'l.one_thing_id')
                        ->where('o.owner', '=', $userThingId)
                        ->where('o.deleted', false);
                })
                ->select('l.' . $column . ' as id', DB::raw('COUNT(*) as cnt'))
                ->whereRaw('l.deleted IS NOT TRUE')
                ->groupBy('l.' . $column)
                ->orderByDesc('cnt')
                ->limit($limit);
            if ($whereNotNull) {
                $query->whereNotNull('l.' . $column);
            }
            return $query->get()->pluck('id')->all();
        };

        // Link types the user uses most.
        $linkTypeIds = $rankOwned('link_type_id');
        // Things the user links to most (the other end of their links).
        $thingIds    = $rankOwned('other_thing_id', true);
        // Classes the user's own things belong to (LINK_TO_CLASS links).
        $classIds = DB::table('links as l')
            ->join('things as o', function ($join) use ($userThingId) {
                $join->on('o.thing_id', '=', 'l.one_thing_id')
                    ->where('o.owner', '=', $userThingId)
                    ->where('o.deleted', false);
            })
            ->select('l.other_thing_id as id', DB::raw('COUNT(*) as cnt'))
            ->where('l.link_type_id', UUID::LINK_TO_CLASS)
            ->whereRaw('l.deleted IS NOT TRUE')
            ->whereNotNull('l.other_thing_id')
            ->groupBy('l.other_thing_id')
            ->orderByDesc('cnt')
            ->limit($limit)
            ->get()
            ->pluck('id')
            ->all();

        // Pad short user lists with globally popular objects of the same type —
        // only when the user's own usage does not already fill the list, so a
        // well-established user never pays for the global GROUP BY queries.
        $globalRank = function (string $column, int $needed, bool $linkToClassOnly = false, bool $whereNotNull = false) {
            if ($needed <= 0) {
                return [];
            }
            $query = DB::table('links as l')
                ->select('l.' . $column . ' as id', DB::raw('COUNT(*) as cnt'))
                ->whereRaw('l.deleted IS NOT TRUE');
            if ($linkToClassOnly) {
                $query->where('l.link_type_id', UUID::LINK_TO_CLASS);
            }
            if ($whereNotNull) {
                $query->whereNotNull('l.' . $column);
            }
            return $query->groupBy('l.' . $column)
                ->orderByDesc('cnt')
                ->limit($needed)
                ->get()
                ->pluck('id')
                ->all();
        };

        $linkTypeIds = array_merge($linkTypeIds, $globalRank('link_type_id', $limit - count($linkTypeIds)));
        $thingIds    = array_merge($thingIds, $globalRank('other_thing_id', $limit - count($thingIds), false, true));
        $classIds    = array_merge($classIds, $globalRank('other_thing_id', $limit - count($classIds), true, true));

        // Resolve full thing rows, keeping the ranked order and applying the
        // standard visibility scope (abstract system objects are excluded, same
        // as the search endpoint).
        $resolve = function (array $ids) {
            $ids = array_values(array_filter(array_unique($ids)));
            if (!$ids) {
                return [];
            }
            $rows = DB::table('things')
                ->auth()
                ->where('things.deleted', false)
                ->where('things.abstract', false)
                ->whereIn('things.thing_id', $ids)
                ->get()
                ->keyBy('thing_id');
            $ordered = [];
            foreach ($ids as $id) {
                if ($rows->has((string) $id)) {
                    $ordered[] = $rows[(string) $id];
                }
            }
            return $ordered;
        };

        return response()->json([
            'links'   => ThingResource::collection($resolve($linkTypeIds)),
            'things'  => ThingResource::collection($resolve($thingIds)),
            'classes' => ThingResource::collection($resolve($classIds)),
        ]);
    }

    /**
     * Toggle favorite status for an object.
     *
     * Creates or deletes a MY_FAVORITE link between the current user and the target object.
     *
     * @param string $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function toggleFavorite(string $id)
    {
        $userThingId = auth()->user()->thing_id;
        $linkTypeId = UUID::MY_FAVORITE;

        $existing = DB::table('links')
            ->where('one_thing_id', $userThingId)
            ->where('link_type_id', $linkTypeId)
            ->where('other_thing_id', $id)
            ->first();

        if ($existing) {
            DB::table('links')->where('link_id', $existing->link_id)->delete();
            return response()->json(['favorite' => false, 'success' => true]);
        }

        DB::table('links')->insert([
            'link_uuid'     => (string) \Illuminate\Support\Str::uuid(),
            'one_thing_id'  => $userThingId,
            'link_type_id'  => $linkTypeId,
            'other_thing_id'=> $id,
            'public'        => 0,
        ]);

        return response()->json(['favorite' => true, 'success' => true]);
    }

    /**
     * Retrieve photos
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     * @throws \Throwable
     */
    public function photos(Request $request)
    {
        try {
            $req = $request->toArray();
            $res = Photos::scanPhotos($req);
            if ($req['finalize'] && $req['only_add'] !== true) {
                Photos::markDeleted($req['finalize']['session'], $req['finalize']['folder_id']);
            }
            return response()->json(
                [
                    'data'    => $res,
                    'success' => true
                ]);
        } catch (\Throwable $e) {
            Log::emergency($e->getMessage());
            throw $e;
            /*return response()->json(
                [
                    'data'      => [],
                    'exception' => $e,
                    'success'   => false
                ])->status(500);*/
        }
    }

    /**
     * Check photos
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     * @throws \Throwable
     */
    public function checkPhotos(Request $request)
    {
        try {
            $req = $request->toArray();
            $res = Photos::checkPhotos($req);

            return response()->json(
                [
                    'data'    => $res,
                    'success' => true
                ]);
        } catch (\Throwable $e) {
            Log::emergency($e);
            throw $e;
        }
    }


    /**
     * Search objects
     *
     * @param \App\Http\Requests\SearchRequest $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function search(SearchRequest $request): \Illuminate\Http\JsonResponse
    {
        $validated = $request->validated();
        // Read the raw body first (works for string JSON bodies without a
        // Content-Type header, e.g. axios JSON.stringify payloads), then fall
        // back to $request->input() for Laravel feature tests where php://input
        // is empty. Relying on $request->input() alone would mis-parse those
        // requests and silently disable every search filter.
        $requestBody = json_decode(file_get_contents('php://input'), true)
            ?: $request->input()
            ?: [];
        if (@$requestBody['tree']) {
            return $this->searchTree();
        }
        $query = DB::table('things')
            ->select('things.*')
            ->auth()
            ->where('things.deleted', 0);

        // Abstract things are grouping containers (e.g. the base link types), not
        // real objects: they are never selectable. Exclude them unless the caller
        // explicitly asks to include them (e.g. a future filter tree).
        if (empty($requestBody['include_abstract'])) {
            $query->where('things.abstract', false);
        }

        // Reference-type filter: restrict results to only things that are
        // actually referenced as an owner or server by other things.
        if (!empty($requestBody['filter_type'])) {
            if ($requestBody['filter_type'] === 'owner') {
                $query->whereIn('things.thing_id', function ($sub) {
                    $sub->select('o.owner')
                        ->from('things as o')
                        ->whereNotNull('o.owner')
                        ->where('o.deleted', 0);
                });
            } elseif ($requestBody['filter_type'] === 'server') {
                $query->whereIn('things.thing_id', function ($sub) {
                    $sub->select('o.server_uuid')
                        ->from('things as o')
                        ->whereNotNull('o.server_uuid')
                        ->where('o.deleted', 0);
                });
            }
        }

        if (!empty($requestBody['classes'])) {
            $query->leftJoin('links', function ($join) {
                $join->on('things.thing_id', '=', 'links.one_thing_id');
                $join->where('links.link_type_id', '=', UUID::LINK_TO_CLASS);
            });
            $query->whereIn('links.other_thing_id', $requestBody['classes']);
            // A class-tree filter means "objects of these classes". Classes and
            // link types can themselves be members of a class (LINK_TO_CLASS),
            // so without an explicit type filter the selected class nodes leak
            // into the results. Default to objects-only unless the caller asked
            // for another type explicitly.
            if (empty($requestBody['type'])) {
                $query->where('things.type', 3);
            }
        }

        if (@$requestBody['search']) {
            $term = '%' . $requestBody['search'] . '%';
            $query->where(function ($query) use ($term) {
                $query->where('name', 'ilike', $term)
                    ->orWhere('description', 'ilike', $term)
                    // Match text inside the translation JSON columns too
                    // (skip the reserved "lang" metadata key, which only holds a language code).
                    ->orWhereExists(function ($sub) use ($term) {
                        $sub->selectRaw('1')
                            ->fromRaw('jsonb_each_text(COALESCE(things.name_translations, \'{}\'::jsonb)) as kv')
                            ->whereRaw('kv.key <> \'lang\' AND kv.value ILIKE ?', [$term]);
                    })
                    ->orWhereExists(function ($sub) use ($term) {
                        $sub->selectRaw('1')
                            ->fromRaw('jsonb_each_text(COALESCE(things.description_translations, \'{}\'::jsonb)) as kv')
                            ->whereRaw('kv.key <> \'lang\' AND kv.value ILIKE ?', [$term]);
                    });
            });
            // Sort source-language name/description matches above translation-only matches
            $query->orderByRaw('CASE WHEN name ILIKE ? OR description ILIKE ? THEN 0 ELSE 1 END', [$term, $term]);
        }
        if (!empty(@$requestBody['type'])) {
            $query->where(function ($query) use ($requestBody) {
                foreach ($requestBody['type'] as $type) {
                    $query->orWhere('type', $type);
                }
            });
        }
        // Visibility filter (new structured filter)
        if (!empty($requestBody['visibility']) && $requestBody['visibility'] !== 'all') {
            if ($requestBody['visibility'] === 'public') {
                $query->where('public', 1);
            } elseif ($requestBody['visibility'] === 'private') {
                $query->where('public', 0);
            } elseif ($requestBody['visibility'] === 'group' && Auth::check()) {
                // Group access: objects linked to groups the current user belongs to
                $userThingId = Auth::user()->thing_id;
                $query->whereExists(function ($sub) use ($userThingId) {
                    $sub->select(DB::raw(1))
                        ->from('links as grp_link')
                        ->join('links as user_link', function ($join) {
                            $join->on('grp_link.one_thing_id', '=', 'user_link.other_thing_id')
                                ->where('user_link.link_type_id', '=', UUID::BELONGS_TO_USER_GROUP)
                                ->where('user_link.one_thing_id', '=', DB::raw("'$userThingId'"));
                        })
                        ->whereColumn('grp_link.other_thing_id', 'things.thing_id')
                        ->where('grp_link.link_type_id', '=', UUID::GROUP_READ_ACCESS);
                });
            }
        }
        // Legacy public/private filter (keep for backward compatibility)
        if (@$_POST['public'] != @$_POST['private']) {
            if (@$_POST['public']) {
                $query->where('public', 1);
            } else {
                $query->where('public', 0);
            }
        }
        // Favorites filter: return objects favorited by the current user
        if (!empty($requestBody['favorites']) && Auth::check()) {
            $query->join('links as fav_links', function ($join) {
                $join->on('things.thing_id', '=', 'fav_links.other_thing_id')
                    ->where('fav_links.link_type_id', '=', UUID::MY_FAVORITE)
                    ->where('fav_links.one_thing_id', '=', Auth::user()->thing_id);
            });
        }
        // Date range filter — interval-overlap semantics so flexible dates
        // (before/after/between with open bounds) match correctly:
        //   [thing.start, thing.end] ∩ [date_from, date_to] ≠ ∅
        if (!empty($requestBody['date_from'])) {
            $query->where(function ($q) use ($requestBody) {
                $q->whereNull('things.end')->orWhere('things.end', '>=', $requestBody['date_from']);
            });
        }
        if (!empty($requestBody['date_to'])) {
            $query->where(function ($q) use ($requestBody) {
                $q->whereNull('things.start')->orWhere('things.start', '<=', $requestBody['date_to']);
            });
        }
        // Owner filter — exact UUID match when possible, ILIKE fallback
        if (!empty($requestBody['owner'])) {
            if (Str::isUuid($requestBody['owner'])) {
                $query->where('things.owner', $requestBody['owner']);
            } else {
                $query->where('things.owner', 'ilike', '%' . $requestBody['owner'] . '%');
            }
        }
        // Server filter
        if (!empty($requestBody['server'])) {
            $query->where('things.server_uuid', $requestBody['server']);
        }
        // Dynamic sort
        $sortMap = [
            'updated' => 'record_updated',
            'created' => 'record_created',
            'start'   => 'start',
            'name'    => 'name',
        ];
        $sortCol = $sortMap[$requestBody['sort_by'] ?? 'start'] ?? 'start';
        $sortDir = ($requestBody['sort_order'] ?? 'desc') === 'asc' ? 'asc' : 'desc';
        // When sorting by a date column, undated objects (NULL) must go last
        // regardless of direction — Postgres would otherwise put them first on
        // DESC. Column names come from the fixed map above, so this is safe.
        // Plain numeric sort is chronologically correct for canonical values:
        // value = year × 10^10 + MMDDHHMMSS tail, monotonic in the year for
        // both positive and negative (BC) values. The backfill migration makes
        // every stored start/end canonical, so no zero-extension is needed.
        if ($sortCol === 'start') {
            $query->orderByRaw('start ' . $sortDir . ' NULLS LAST');
        } else {
            $query->orderBy($sortCol, $sortDir);
        }
        // groupBy(thing_id): the class filter (and favorites join) can match
        // an object through several links at once; group by the PK so each
        // object appears exactly once. (Postgres accepts selecting the other
        // columns because they are functionally dependent on the PK, and it
        // works even though things.data is plain `json`, which DISTINCT can't
        // dedupe.)
        $data = $query->groupBy('things.thing_id')->limit(100)->get();

        // Link-type results carry their taxonomy base category (the abstract
        // base they hang under, e.g. "Kinship", "Hierarchy") so the picker can
        // group them.
        $requestTypes = array_map('intval', (array) ($requestBody['type'] ?? []));
        if (in_array(UUID::G_LINK, $requestTypes, true)) {
            $this->attachLinkTypeCategories($data);
        }

        $ids = $data->pluck('thing_id')->toArray();
        $links = [];
        if (!empty($ids)) {
            $links = DB::table('links')
                ->select('links.*', 'things.name', 'one_side.name as one_name', 'link_types.name as link_name')
                ->addSelect('link_types.name_translations as link_name_translations')
                ->whereIn('links.one_thing_id', $ids)
                ->orWhereIn('links.other_thing_id', $ids)
                ->leftJoin('things', function ($join) {
                    $join->on('links.other_thing_id', '=', 'things.thing_id');
                })
                ->leftJoin('things as one_side', function ($join) {
                    $join->on('links.one_thing_id', '=', 'one_side.thing_id');
                })
                ->leftJoin('things as link_types', function ($join) {
                    $join->on('links.link_type_id', '=', 'link_types.thing_id');
                })
                ->get()->toArray();
        }

        // Multilevel related objects: attach direct related links (with a
        // shallow resolved `target`) to each result thing. Deeper levels are
        // fetched on demand via GET /object/{id}?depth=N.
        $depth = (int) ($requestBody['depth'] ?? RelatedObjectsResolver::DEFAULT_SEARCH_DEPTH);
        $depth = min(max($depth, 0), RelatedObjectsResolver::SEARCH_DEPTH_CAP);

        $linksByRoot = $depth > 0
            ? (new RelatedObjectsResolver)->forMany($ids, RelatedObjectsResolver::SEARCH_BREADTH)
            : [];

        $things = $data->map(function ($thing) use ($linksByRoot) {
            if (isset($linksByRoot[$thing->thing_id])) {
                $thing->links = $linksByRoot[$thing->thing_id];
            }
            return $thing;
        });

        return response()->json([
            'things' => ThingResource::collection($things),
            'links'  => LinkResource::collection($links),
        ]);

    }

    /**
     * Attach the taxonomy base category to link-type search results so the
     * picker can group them (e.g. "Kinship", "Hierarchy"). The base is the
     * direct child of the Link root that the link type hangs under; for link
     * types directly under Link it is the link type itself. Link types that
     * are not part of the tree (system-internal ones) get no category.
     *
     * @param \Illuminate\Support\Collection $things
     */
    private function attachLinkTypeCategories($things): void
    {
        $bases = DB::table('links')
            ->join('things as t', 't.thing_id', '=', 'links.other_thing_id')
            ->where('links.one_thing_id', UUID::LINK)
            ->where('links.link_type_id', UUID::LINK_TO_PARENT)
            ->where('links.deleted', false)
            ->where('t.type', UUID::G_LINK)
            ->where('t.deleted', false)
            ->get(['t.thing_id', 't.name', 't.name_translations'])
            ->keyBy('thing_id');

        if ($bases->isEmpty()) {
            return;
        }

        // child => parent edges among link types (any depth).
        $parents = DB::table('links')
            ->join('things as p', 'p.thing_id', '=', 'links.one_thing_id')
            ->join('things as c', 'c.thing_id', '=', 'links.other_thing_id')
            ->where('links.link_type_id', UUID::LINK_TO_PARENT)
            ->where('links.deleted', false)
            ->where('p.type', UUID::G_LINK)->where('p.deleted', false)
            ->where('c.type', UUID::G_LINK)->where('c.deleted', false)
            ->pluck('links.one_thing_id', 'links.other_thing_id');

        foreach ($things as $thing) {
            if ((int) $thing->type !== UUID::G_LINK) {
                continue;
            }
            $base = $this->resolveLinkBase($thing->thing_id, $bases, $parents);
            if ($base) {
                $thing->category_id           = $base->thing_id;
                $thing->category_name         = $base->name;
                $thing->category_translations = $base->name_translations;
            }
        }
    }

    private function resolveLinkBase(string $thingId, $bases, $parents): ?object
    {
        if (isset($bases[$thingId])) {
            return $bases[$thingId];
        }
        $node  = $thingId;
        $guard = 0;
        while (isset($parents[$node]) && $guard++ < 20) {
            $node = $parents[$node];
            if (isset($bases[$node])) {
                return $bases[$node];
            }
        }
        return null;
    }

    /**
     * Get available filter options (owners and servers) for the search filter panel.
     * Returns only owners/servers that actually have visible objects assigned,
     * so a user never sees filter values for objects they have no access to.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function searchOptions(): \Illuminate\Http\JsonResponse
    {
        // Distinct owners with names and object counts.
        $owners = DB::table('things as o')
            ->select('o.owner as thing_id', 't.name', 't.type', DB::raw('COUNT(*) as count'))
            ->leftJoin('things as t', 'o.owner', '=', 't.thing_id')
            ->where('o.deleted', 0)
            ->whereNotNull('o.owner')
            ->where($this->visibleObjectsScope('o'))
            ->groupBy('o.owner', 't.name', 't.type')
            ->orderByDesc(DB::raw('COUNT(*)'))
            ->limit(100)
            ->get();

        // Distinct server UUIDs with names and object counts
        $servers = DB::table('things as o')
            ->select('o.server_uuid as thing_id', 't.name', 't.type', DB::raw('COUNT(*) as count'))
            ->leftJoin('things as t', 'o.server_uuid', '=', 't.thing_id')
            ->where('o.deleted', 0)
            ->whereNotNull('o.server_uuid')
            ->where($this->visibleObjectsScope('o'))
            ->groupBy('o.server_uuid', 't.name', 't.type')
            ->orderByDesc(DB::raw('COUNT(*)'))
            ->limit(100)
            ->get();

        return response()->json([
            'owners' => $owners,
            'servers' => $servers,
        ]);
    }

    /**
     * Closure restricting a things query (aliased) to records the current user
     * may see: public (or null), the user's own, and group-accessible. Mirrors
     * the auth() query builder macro, but for a configurable table alias so it
     * can be applied to the referencing side of the options query.
     */
    private function visibleObjectsScope(string $alias = 'o'): \Closure
    {
        return function ($query) use ($alias) {
            $query->where($alias . '.public', 1)
                ->orWhereNull($alias . '.public');

            if (Auth::check()) {
                $userThingId = Auth::user()->thing_id;

                // Objects the user owns
                $query->orWhere($alias . '.owner', $userThingId);

                // Group-based access: visible via GROUP_READ_ACCESS links to
                // a group the user belongs to (BELONGS_TO_USER_GROUP)
                $query->orWhereIn($alias . '.thing_id', function ($sub) use ($userThingId) {
                    $sub->select('gl.one_thing_id')
                        ->from('links as gl')
                        ->join('links as ug', 'ug.other_thing_id', '=', 'gl.other_thing_id')
                        ->where('gl.link_type_id', UUID::GROUP_READ_ACCESS)
                        ->where('ug.link_type_id', UUID::BELONGS_TO_USER_GROUP)
                        ->where('ug.one_thing_id', $userThingId);
                });
            }
        };
    }

    /**
     * Get classes tree
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function searchTree()
    {
        $rootId = UUID::EVERYTHING;
        $linkTypeParent = UUID::LINK_TO_PARENT;
        $classType = UUID::G_CLASS;
        $linkType = UUID::G_LINK;
        $systemId = UUID::SYSTEM;
        $isAuthenticated = Auth::check();

        // Only filter by public if user is not authenticated
        $publicCondition = $isAuthenticated ? '' : 'AND c.public IS TRUE';

        // Sort siblings so classes come first, then link types, and "System" last
        $sortPriority = 'CASE WHEN id = ? THEN 2 WHEN type = ? THEN 0 ELSE 1 END';

        $rawSql = "
    WITH RECURSIVE descendants (name, level, id, parent_id, description, type, public, name_translations) AS (
        SELECT
            c.name,
            1,
            c.thing_id,
            CAST(NULL AS UUID),
            c.description,
            c.type,
            c.public,
            c.name_translations
        FROM things c
        WHERE c.thing_id = ?

        UNION ALL

        SELECT
            c.name,
            d.level + 1,
            c.thing_id,
            l.one_thing_id,
            c.description,
            c.type,
            CAST(l.description AS VARCHAR(255)),
            c.public,
            c.name_translations
        FROM descendants d
        JOIN links l ON d.id = l.one_thing_id AND l.link_type_id = ? AND l.deleted IS NOT TRUE
        JOIN things c ON l.other_thing_id = c.thing_id
        WHERE (c.type = ? OR c.type = ?) AND c.deleted IS NOT TRUE AND d.level < 10 $publicCondition
    )
    SELECT * FROM descendants
    ORDER BY level, $sortPriority, name;
    ";

        $results = DB::select($rawSql, [
            $rootId,
            $linkTypeParent,
            $classType,
            $linkType,
            $systemId,
            $classType,
        ]);

        // Remove duplicate nodes, keep the one with the smallest level
        $uniqueRows = [];
        foreach ($results as $row) {
            $id = (string) $row->id;
            if (!isset($uniqueRows[$id]) || $row->level < $uniqueRows[$id]->level) {
                $uniqueRows[$id] = $row;
            }
        }
        $results = array_values($uniqueRows);

        // Cast boolean fields to int (PostgreSQL returns 't'/'f' for booleans)
        foreach ($results as $row) {
            if (isset($row->public)) {
                $row->public = $row->public === true || $row->public === 't' ? 1 : 0;
            }
            if (isset($row->name_translations) && is_string($row->name_translations)) {
                $row->name_translations = json_decode($row->name_translations, true);
            }
        }

        $tree = $this->buildTree($results);
        return response()->json(['things' => $tree]);
    }

    protected function buildTree($items)
    {
        $indexed = [];
        $roots = [];

        // First pass: index by ID (as string) and initialize nodes
        foreach ($items as &$item) {
            $item->nodes = [];                       // ensure nodes property exists
            $indexed[(string) $item->id] = &$item;
        }

        // Second pass: attach each node to its parent (or to roots)
        unset($item);
        foreach ($items as &$item) {
            $parentId = $item->parent_id !== null ? (string) $item->parent_id : null;
            if ($parentId === null || !isset($indexed[$parentId])) {
                // No parent -> root node
                $roots[] = &$item;
            } else {
                // Attach this node to its parent's nodes array
                $indexed[$parentId]->nodes[] = &$item;
            }
        }

        return $roots;
    }

    public function classes()
    {
        $data = collect(DB::table('things')
            ->selectRaw('things.*, links.other_thing_id')
            ->auth('links')
            //->auth()
            ->leftJoin('links', static function ($join) {
                $join->on('things.thing_id', 'links.one_thing_id')
                    ->whereRaw('links.link_type_id = ?', UUID::LINK_TO_PARENT);
            })
            ->whereIn('type', [UUID::G_CLASS, UUID::GENERAL, UUID::G_LINK, UUID::G_EXTERNAL])
            ->orderByRaw('type = ?, type = ? DESC', [UUID::GENERAL, UUID::G_CLASS])->get())->keyBy('thing_id')->toArray();

        foreach ($data as $id => $node) {
            if (!empty($node->other_thing_id)) {
                if (!isset($data[$node->other_thing_id])) {
                    $data[$node->other_thing_id] = new \stdClass();
                }
                $data[$node->other_thing_id]->children[] = &$data[$id];
            }
        }
        return view('classes', ['class' => $data[UUID::EVERYTHING]]);
    }

    public function thumb() {
        echo '';
    }
}

