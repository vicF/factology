<?php

namespace App\Http\Controllers;

use App\Http\Requests\SearchRequest;
use App\Http\Resources\LinkResource;
use App\Http\Resources\ThingResource;
use App\Models\Classes\Media;
use App\Models\Classes\MediaFile;
use App\Models\Classes\Anything;
use Fokin\Facts\Data\UUID;
use Fokin\PhotoFacts\Models\Photos;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

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
        return response()->json(
            [
                'data'    => Anything::getDataById($id),
                'success' => true
            ]);
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
            'start' => ['nullable', 'string', 'regex:/^\d*$/'],

            /**
             * End date/time as numeric string: YYYYMMDDHHMMSS
             * @example 20260228181234
             */
            'end' => [
                'nullable',
                'string',
                'regex:/^\d*$/',
                function ($attribute, $value, $fail) use ($request) {
                    if ($request->has('start') && $value < $request->start) {
                        $fail('The end date must be after the start date.');
                    }
                },
            ],

            /**
             * Public flag (0 or 1)
             * @example 1
             */
            'public' => ['required', 'integer', 'in:0,1'],

            /**
             * UUID of parent object (if any)
             * @example null
             */
            'parent_id' => ['nullable', 'string', 'uuid'],

            /**
             * Type identifier
             * @example 3
             */
            'type' => ['required', 'integer', 'min:1', 'max:5'],

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
        ]);
        return DB::transaction(static function () use ($request) {
            $model = new Anything($request->toArray());
            try {
                $model->save();
            } catch(\Throwable $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to save the record',
                    'errors' => $e->getMessage() ?? 'Unknown error occurred'
                ], $e->getCode() ?:500);
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
        if(!empty($data['link_id'])) {
            DB::table('links')
                ->where('link_id', $data['link_id'])
                ->update($data);
        } else {
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
        Anything::deleteById($id);
        return response()->json(['success' => true]);
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
        $requestBody = json_decode(file_get_contents('php://input'), true);
        if (@$requestBody['tree']) {
            return $this->searchTree();
        }
        $query = DB::table('things')
            ->select('things.*')
            ->auth()
            ->where('things.deleted', 0);

        if (!empty($requestBody['classes'])) {
            $query->leftJoin('links', function ($join) {
                $join->on('things.thing_id', '=', 'links.one_thing_id');
                $join->where('links.link_type_id', '=', UUID::LINK_TO_CLASS);
            });
            $query->whereIn('links.other_thing_id', $requestBody['classes']);
        }

        if (@$requestBody['search']) {
            $query->where(function ($query) use ($requestBody) {
                $query->where('name', 'like', '%' . $requestBody['search'] . '%')
                    ->orWhere('description', 'like', '%' . $requestBody['search'] . '%');
            });
        }
        if (!empty(@$requestBody['type'])) {
            $query->where(function ($query) use ($requestBody) {
                foreach ($requestBody['type'] as $type) {
                    $query->orWhere('type', $type);
                }
            });
        }
        if (@$_POST['public'] != @$_POST['private']) {
            if (@$_POST['public']) {
                $query->where('public', 1);
            } else {
                $query->where('public', 0);
            }
        }
        $data = $query->orderBy('record_updated', 'DESC')->limit(100)->get()->keyBy('thing_id');

        $ids = $data->pluck('thing_id')->toArray();
        $links = [];
        if (!empty($ids)) {
            $links = DB::table('links')
                ->select('links.*', 'things.name', 'link_types.name as link_name')
                ->whereIn('links.one_thing_id', $ids)
                ->orWhereIn('links.other_thing_id', $ids)
                ->leftJoin('things', function ($join) {
                    $join->on('links.other_thing_id', '=', 'things.thing_id');
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
     * Get classes tree
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function searchTree()
    {
        $rootId = UUID::ANYTHING;
        $linkTypeParent = UUID::LINK_TO_PARENT;
        $classType = UUID::G_CLASS;
        $linkType = UUID::G_LINK;
        $isAuthenticated = Auth::check();

        // Only filter by public if user is not authenticated
        $publicCondition = $isAuthenticated ? '' : 'AND c.public IS TRUE';

        $rawSql = "
    WITH RECURSIVE descendants (name, level, id, parent_id, description, translation, public) AS (
        SELECT
            c.name,
            1,
            c.thing_id,
            CAST(NULL AS UUID),
            c.description,
            CAST(NULL AS VARCHAR(255)),
            c.public
        FROM things c
        WHERE c.thing_id = ? $publicCondition

        UNION ALL

        SELECT
            c.name,
            d.level + 1,
            c.thing_id,
            l.one_thing_id,
            c.description,
            CAST(l.translation AS VARCHAR(255)),
            c.public
        FROM descendants d
        JOIN links l ON d.id = l.one_thing_id AND l.link_type_id = ?
        JOIN things c ON l.other_thing_id = c.thing_id
        WHERE (c.type = ? OR c.type = ?) AND d.level < 10 $publicCondition
    )
    SELECT * FROM descendants ORDER BY level;
    ";

        $results = DB::select($rawSql, [
            $rootId,
            $linkTypeParent,
            $classType,
            $linkType,
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
        return view('classes', ['class' => $data[UUID::ANYTHING]]);
    }

    public function thumb() {
        echo '';
    }
}

