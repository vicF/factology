<?php

namespace App\Http\Controllers;

use App\Http\Requests\ImportRequest;
use App\Services\DatabaseConsistencyChecker;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ExportImportController extends BaseController
{
    /**
     * Export things and links as JSON.
     * Admins export everything; regular users export everything they can see —
     * their own objects plus public ones (and links whose both endpoints — and
     * link type — are within that visible set).
     */
    public function export(Request $request)
    {
        $isAdmin = Auth::check() && Auth::user()->is_admin;
        $userThingId = Auth::user()->thing_id;

        $includeDeleted = $request->boolean('include_deleted', false);

        $thingsQuery = DB::table('things');
        $linksQuery = DB::table('links');

        if (!$isAdmin) {
            // The set of thing_ids visible to this user: public or owned by them.
            $visibleIds = DB::table('things')
                ->where(function ($q) use ($userThingId) {
                    $q->where('public', true)
                        ->orWhere('owner', $userThingId);
                })
                ->select('thing_id');

            $thingsQuery->where(function ($q) use ($userThingId) {
                $q->where('public', true)
                    ->orWhere('owner', $userThingId);
            });

            // Links are visible when both endpoints (and the link type) are.
            $linksQuery->whereIn('one_thing_id', $visibleIds)
                ->whereIn('other_thing_id', $visibleIds)
                ->whereIn('link_type_id', $visibleIds);
        }

        if (!$includeDeleted) {
            $thingsQuery->where('deleted', false);
            $linksQuery->where('deleted', false);
        }

        $totalThings = $thingsQuery->count();
        $totalLinks = $linksQuery->count();
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        // Stream JSON response — chunked to avoid OOM with large datasets.
        return response()->stream(function () use ($thingsQuery, $linksQuery, $totalThings, $totalLinks, $serverUuid, $includeDeleted, $isAdmin) {
            // Open JSON and write header fields
            echo '{';
            echo '"version":1,';
            echo '"exported_at":' . json_encode(now()->toIso8601String()) . ',';
            echo '"server_uuid":' . json_encode($serverUuid) . ',';
            echo '"exported_by":' . json_encode(Auth::user()->thing_id) . ',';
            echo '"include_deleted":' . json_encode($includeDeleted) . ',';
            echo '"export_scope":"' . ($isAdmin ? 'all' : 'visible') . '",';
            echo '"stats":' . json_encode(['things' => $totalThings, 'links' => $totalLinks]) . ',';

            // ── Things ──────────────────────────────────────────────
            echo '"data":{"things":[';

            $first = true;
            $thingsQuery->orderBy('thing_id')->chunk(500, function ($things) use (&$first) {
                foreach ($things as $thing) {
                    if (!$first) {
                        echo ',';
                    }
                    $first = false;

                    // Decode JSON data column to prevent double-encoding
                    if (isset($thing->data) && is_string($thing->data)) {
                        $thing->data = json_decode($thing->data);
                    }

                    echo json_encode($thing, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                }
            });

            // ── Links ───────────────────────────────────────────────
            echo '],"links":[';

            $first = true;
            $linksQuery->orderBy('link_id')->chunk(1000, function ($links) use (&$first) {
                foreach ($links as $link) {
                    if (!$first) {
                        echo ',';
                    }
                    $first = false;

                    echo json_encode($link, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                }
            });

            // Close JSON structure
            echo ']}}';
        }, 200, [
            'Content-Type' => 'application/json',
        ]);
    }

    /**
     * Import things and links from JSON.
     * Admins import everything; regular users import only their own objects
     * (owner is overridden to the importing user).
     */
    public function import(ImportRequest $request)
    {
        $isAdmin = Auth::check() && Auth::user()->is_admin;
        $userThingId = Auth::user()->thing_id;

        // Parse input JSON (from file upload or request body)
        $jsonData = null;

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $contents = file_get_contents($file->getRealPath());
            $jsonData = json_decode($contents, true);
            unset($contents); // Free 230MB+ of raw JSON memory immediately
        } elseif ($request->isJson()) {
            $jsonData = $request->json()->all();
        } else {
            $contents = $request->getContent();
            $jsonData = json_decode($contents, true);
            unset($contents);
        }

        if (empty($jsonData) || !isset($jsonData['data'])) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid import data. Expected JSON with "data" key containing "things" and/or "links".',
            ], 422);
        }

        $conflictMode = $request->input('conflict_mode', 'latest_wins');
        $importData = $jsonData['data'];
        unset($jsonData); // Free the top-level array (contains copies of things/links)

        // Validate server_uuid is present on every imported thing
        if (!empty($importData['things'])) {
            foreach ($importData['things'] as $i => $thing) {
                if (empty($thing['server_uuid'])) {
                    $id = $thing['thing_id'] ?? "(index {$i})";
                    return response()->json([
                        'success' => false,
                        'message' => "Thing {$id} is missing 'server_uuid'. All exported data includes server_uuid for provenance tracking.",
                    ], 422);
                }
            }
        }

        $result = [
            'imported' => ['things' => 0, 'links' => 0],
            'skipped'  => ['things' => 0, 'links' => 0],
            'deleted'  => ['things' => 0, 'links' => 0],
            'errors'   => [],
        ];

        try {
            DB::transaction(function () use ($importData, $conflictMode, &$result, $isAdmin, $userThingId) {
                // ── Things ────────────────────────────────────────
                if (!empty($importData['things'])) {
                    // Pre-load existing thing IDs (chunked to avoid PostgreSQL 65535 param limit)
                    $allIds = array_map('strval', array_column($importData['things'], 'thing_id'));
                    $allIds = array_values(array_unique(array_filter($allIds)));

                    $existingMap = [];
                    if (!empty($allIds)) {
                        foreach (array_chunk($allIds, 1000) as $idChunk) {
                            $existingRows = DB::table('things')
                                ->whereIn('thing_id', $idChunk)
                                ->get(['thing_id', 'record_updated', 'owner']);
                            foreach ($existingRows as $row) {
                                $existingMap[$row->thing_id] = $row;
                            }
                        }
                    }

                    // Split into new (batch insert) and existing (conflict resolution)
                    $newBatch = [];
                    foreach ($importData['things'] as $thing) {
                        $tid = $thing['thing_id'];
                        if (isset($existingMap[$tid])) {
                            // Existing — process individually
                            $this->importThing($thing, $conflictMode, $result, $isAdmin, $userThingId, $existingMap[$tid]);
                        } else {
                            // New thing — skip if soft-deleted
                            if (!empty($thing['deleted'])) {
                                $result['skipped']['things']++;
                                continue;
                            }

                            $insertData = $this->buildThingData($thing);

                            if (!$isAdmin) {
                                $insertData['owner'] = $userThingId;
                            } elseif (empty($insertData['owner'])) {
                                $insertData['owner'] = $thing['owner'] ?? $userThingId;
                            }

                            $insertData['thing_id'] = $tid;
                            $insertData['record_created'] = $thing['record_created'] ?? now();
                            $insertData['record_updated'] = $thing['record_updated'] ?? now();
                            $insertData['imported_at'] = now();

                            $newBatch[] = $insertData;

                            // Flush batch every 500 rows
                            if (count($newBatch) >= 500) {
                                DB::table('things')->insert($newBatch);
                                $result['imported']['things'] += count($newBatch);
                                $newBatch = [];
                            }
                        }
                    }

                    // Insert remaining new things
                    if (!empty($newBatch)) {
                        DB::table('things')->insert($newBatch);
                        $result['imported']['things'] += count($newBatch);
                    }
                }

                // ── Links ────────────────────────────────────────
                if (!empty($importData['links'])) {
                    // Pre-load ALL thing IDs for O(1) FK validation
                    $allThingIds = [];
                    DB::table('things')->orderBy('thing_id')->chunk(1000, function ($chunk) use (&$allThingIds) {
                        foreach ($chunk as $row) {
                            $allThingIds[$row->thing_id] = true;
                        }
                    });

                    // Pre-load existing link UUIDs in a single query
                    $linkUuids = array_map('strval', array_column(
                        array_filter($importData['links'], fn($l) => !empty($l['link_uuid'])),
                        'link_uuid'
                    ));

                    $existingLinkMap = [];
                    if (!empty($linkUuids)) {
                        foreach (array_chunk($linkUuids, 1000) as $uuidChunk) {
                            $existingLinks = DB::table('links')
                                ->whereIn('link_uuid', $uuidChunk)
                                ->get(['link_id', 'link_uuid']);
                            foreach ($existingLinks as $row) {
                                $existingLinkMap[$row->link_uuid] = $row;
                            }
                        }
                    }

                    $newLinkBatch = [];
                    foreach ($importData['links'] as $link) {
                        $matched = null;

                        // Match by link_uuid first
                        if (!empty($link['link_uuid']) && isset($existingLinkMap[$link['link_uuid']])) {
                            $matched = $existingLinkMap[$link['link_uuid']];
                        }

                        // Fall back to unique constraint match
                        if (!$matched
                            && !empty($link['one_thing_id'])
                            && !empty($link['other_thing_id'])
                            && !empty($link['link_type_id'])
                        ) {
                            $matched = DB::table('links')
                                ->where('one_thing_id', $link['one_thing_id'])
                                ->where('other_thing_id', $link['other_thing_id'])
                                ->where('link_type_id', $link['link_type_id'])
                                ->first();
                        }

                        if ($matched) {
                            // Existing link — conflict resolution
                            if (!empty($link['deleted'])) {
                                DB::table('links')->where('link_id', $matched->link_id)->update(['deleted' => true]);
                                $result['deleted']['links']++;
                            } elseif ($conflictMode === 'overwrite') {
                                $updateData = $this->buildLinkData($link);
                                DB::table('links')->where('link_id', $matched->link_id)->update($updateData);
                                $result['imported']['links']++;
                            } else {
                                $result['skipped']['links']++;
                            }
                        } else {
                            // New link
                            if (!empty($link['deleted'])) {
                                $result['skipped']['links']++;
                                continue;
                            }

                            // Verify referenced things exist (FK constraint)
                            if (!empty($link['one_thing_id']) && !empty($link['other_thing_id'])) {
                                $refIds = array_unique([$link['one_thing_id'], $link['other_thing_id']]);
                                $existingRefs = DB::table('things')
                                    ->whereIn('thing_id', $refIds)
                                    ->pluck('thing_id')
                                    ->all();
                                $missing = array_diff($refIds, $existingRefs);
                                if (!empty($missing)) {
                                    $result['skipped']['links']++;
                                    continue;
                                }
                            }

                            $insertData = $this->buildLinkData($link);
                            if (empty($insertData['link_uuid']) && !empty($link['link_uuid'])) {
                                $insertData['link_uuid'] = $link['link_uuid'];
                            }
                            if (empty($insertData['link_uuid'])) {
                                $insertData['link_uuid'] = (string) Str::uuid();
                            }

                            $insertData['imported_at'] = now();

                            $newLinkBatch[] = $insertData;

                            if (count($newLinkBatch) >= 1000) {
                                DB::table('links')->insert($newLinkBatch);
                                $result['imported']['links'] += count($newLinkBatch);
                                $newLinkBatch = [];
                            }
                        }
                    }

                    if (!empty($newLinkBatch)) {
                        DB::table('links')->insert($newLinkBatch);
                        $result['imported']['links'] += count($newLinkBatch);
                    }
                }
            });
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Import failed: ' . $e->getMessage(),
                'result'  => $result,
            ], 500);
        }

        // Bulk imports can leave structural issues behind (e.g. objects whose
        // class did not make it into the source export). Audit the database and
        // attach the report so the caller can spot problems right away. Non-admin
        // users only see issues in their own imported data.
        $result['consistency'] = (new DatabaseConsistencyChecker())->check(
            $isAdmin ? null : $userThingId
        );

        return response()->json([
            'success' => true,
            'result'  => $result,
        ]);
    }

    /**
     * Import a single thing record (conflict resolution for existing records).
     */
    private function importThing(array $thing, string $conflictMode, array &$result, bool $isAdmin, string $userThingId, ?\stdClass $existingThing = null): void
    {
        if (empty($thing['thing_id'])) {
            $result['errors'][] = 'Thing missing thing_id, skipping';
            return;
        }

        if (!$existingThing) {
            $existingThing = DB::table('things')->where('thing_id', $thing['thing_id'])->first();
        }

        if (!$existingThing) {
            $result['errors'][] = 'Thing ' . $thing['thing_id'] . ' not found for conflict resolution, skipping';
            return;
        }

        // Non-admin users can only update their own things
        if (!$isAdmin && $existingThing->owner !== $userThingId) {
            $result['skipped']['things']++;
            return;
        }

        // Thing exists — apply conflict resolution
        if ($conflictMode === 'keep_existing') {
            $result['skipped']['things']++;
            return;
        }

        if ($conflictMode === 'latest_wins' && isset($thing['record_updated'], $existingThing->record_updated)) {
            $importTime = strtotime($thing['record_updated']);
            $existingTime = strtotime($existingThing->record_updated);
            if ($existingTime >= $importTime) {
                $result['skipped']['things']++;
                return;
            }
        }

        // Handle deletion
        if (!empty($thing['deleted'])) {
            DB::table('things')->where('thing_id', $thing['thing_id'])->update(['deleted' => true]);
            $result['deleted']['things']++;
            return;
        }

        // Overwrite (mode = overwrite, or latest_wins with newer import data)
        $updateData = $this->buildThingData($thing);
        $updateData['record_updated'] = now();
        $updateData['imported_at'] = now();
        DB::table('things')->where('thing_id', $thing['thing_id'])->update($updateData);
        $result['imported']['things']++;
    }

    /**
     * Build thing data array from import row, excluding thing_id.
     */
    private function buildThingData(array $thing): array
    {
        $fields = ['name', 'type', 'description', 'start', 'end',
                   'start_meta', 'end_meta',
                   'owner', 'public', 'deleted', 'data', 'server_uuid'];

        $data = [];
        foreach ($fields as $field) {
            if (array_key_exists($field, $thing)) {
                $value = $thing[$field];
                // Encode JSON fields back to JSON strings if they're arrays/objects
                if (in_array($field, ['data', 'start_meta', 'end_meta'], true)
                    && (is_array($value) || is_object($value))) {
                    $value = json_encode($value);
                }
                $data[$field] = $value;
            }
        }

        $data['record_updated'] = $thing['record_updated'] ?? now();

        return $data;
    }

    /**
     * Build link data array from import row.
     */
    private function buildLinkData(array $link): array
    {
        $fields = ['link_uuid', 'one_thing_id', 'link_type_id', 'other_thing_id',
                   'description', 'public', 'link_start', 'link_end',
                   'link_start_meta', 'link_end_meta',
                   'deleted'];

        $data = [];
        foreach ($fields as $field) {
            if (array_key_exists($field, $link)) {
                $value = $link[$field];
                // Encode JSON fields back to JSON strings if they're arrays/objects
                if (in_array($field, ['link_start_meta', 'link_end_meta'], true)
                    && (is_array($value) || is_object($value))) {
                    $value = json_encode($value);
                }
                $data[$field] = $value;
            }
        }

        return $data;
    }
}
