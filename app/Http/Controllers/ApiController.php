<?php

namespace App\Http\Controllers;

use App\Eloquent\Link;
use App\Models\Classes\Media;
use App\Models\Classes\MediaFile;
use App\Models\Classes\Anything;
use Fokin\Facts\Data\UUID;
use Fokin\PhotoFacts\Models\Photos;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
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
        return DB::transaction(static function () use ($request) {
            $model = new Anything($request->toArray());
            $model->save();
            if ($request->parent_id) {

                $model->setLink([UUID::LINK_TO_PARENT], $request->parent_id, 'Child of');
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
    public function deleteLink(Request $request, $id)
    {
        try {
            $deleted = DB::table('links')
                ->where('link_id', $id)
                ->update(['deleted' => 1]);

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
     * @return \Illuminate\Http\JsonResponse
     */
    public function search(): \Illuminate\Http\JsonResponse
    {
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
                $join->where('links.deleted', '=', 0);
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
        $links = DB::table('links')
            ->select('links.*', 'things.name')
            ->whereIn('links.one_thing_id', $ids)
            ->orWhere('other_thing_id', $ids)
            ->leftJoin('things', function ($join) {
                $join->on('links.other_thing_id', '=', 'things.thing_id');
                $join->where('links.deleted', '=', 0);
            })
            ->get()->toArray();

        return response()->json(json_encode([
            'things' => $data->toArray(),
            'links'  => $links,
        ]));

    }

    /**
     * Get classes tree
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function searchTree()
    {
        $requestBody = json_decode(file_get_contents('php://input'), true);
        $linkToParent = UUID::LINK_TO_PARENT;
        $something = UUID::SOMETHING;
        $rawSql =
            "with recursive descendants
                (name, level, id, parent_id, description, translation)  as (
                    select c.name, 1 as level, c.thing_id, l.other_thing_id, c.description, l.translation
                    from things c
                    left join links l on l.one_thing_id = c.thing_id AND link_type_id = '$linkToParent'
                    where c.type=2 and c.thing_id = '$something'
                    union distinct
                    select c.name, d.level+1, c.thing_id, l.other_thing_id, c.description, l.translation
                    from descendants d, things c
                    left join links l on l.one_thing_id = c.thing_id AND link_type_id = '$linkToParent'
                    where c.type=2 AND d.id = l.other_thing_id AND d.level < 10
                )
                select * from descendants ORDER BY level;";
        $results = $this->buildTree((array)DB::select($rawSql));
        return response()->json([
            'things' => $results,
        ]);
    }

    protected function buildTree($items, $parentId = UUID::ANYTHING)
    {
        $tree = [];
        foreach ($items as $item) {
            if ($item->parent_id === $parentId) {
                $children = $this->buildTree($items, $item->id);

                if ($children) {
                    $item->nodes = $children;
                }
                $tree[] = $item;
            }
        }
        return $tree;
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
}

