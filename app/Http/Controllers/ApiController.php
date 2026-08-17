<?php

namespace App\Http\Controllers;

use App\Http\Requests\SearchRequest;
use App\Http\Resources\LinkResource;
use App\Http\Resources\ThingResource;
use App\Models\Classes\Media;
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
    public function get($id)
    {
        try {
            $data = Everything::getDataById($id);
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
     * Store object
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
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
     * Store link
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function storeLink(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->toArray();
        // Flexible-date meta columns are jsonb: encode arrays to JSON strings.
        foreach (['link_start_meta', 'link_end_meta'] as $metaField) {
            if (isset($data[$metaField]) && is_array($data[$metaField])) {
                $data[$metaField] = json_encode($data[$metaField]);
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
                    if ($sameDirection && !empty($data['translation'])) {
                        DB::table('links')
                            ->where('link_id', $existing->link_id)
                            ->update(['translation' => $data['translation']]);
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
            'translation'   => 'Favorite',
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
        if ($sortCol === 'start') {
            // Legacy values are unpadded (e.g. '2026081112' = 2026-08-11 12:00)
            // and sort numerically as tiny numbers next to 14-digit canonicals
            // ('20260809000000'), so 2026 objects could fall below the page
            // limit. Compare the zero-extended key instead: multiplying by the
            // power of ten that brings the digit count to 14 is monotonic for
            // both positive and negative (BC) values, so the order is truly
            // chronological.
            $query->orderByRaw('start * POWER(10, GREATEST(0, 14 - LENGTH(start::text))) ' . $sortDir . ' NULLS LAST');
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

        $ids = $data->pluck('thing_id')->toArray();
        $links = [];
        if (!empty($ids)) {
            $links = DB::table('links')
                ->select('links.*', 'things.name', 'one_side.name as one_name', 'link_types.name as link_name')
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

        return response()->json([
            'things' => ThingResource::collection($data),
            'links'  => LinkResource::collection($links),
        ]);

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
    WITH RECURSIVE descendants (name, level, id, parent_id, description, type, translation, public, name_translations) AS (
        SELECT
            c.name,
            1,
            c.thing_id,
            CAST(NULL AS UUID),
            c.description,
            c.type,
            CAST(NULL AS VARCHAR(255)),
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
            CAST(l.translation AS VARCHAR(255)),
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

