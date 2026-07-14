<?php

namespace App\Http\Controllers;

use App\Http\Requests\ImportRequest;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ExportImportController extends BaseController
{
    /**
     * Export all things and links as JSON.
     * Admin only.
     */
    public function export(Request $request)
    {
        if (!Auth::check() || !Auth::user()->is_admin) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $includeDeleted = $request->boolean('include_deleted', false);

        // Count first — fast queries
        $thingsQuery = DB::table('things');
        $linksQuery = DB::table('links');

        if (!$includeDeleted) {
            $thingsQuery->where('deleted', false);
            $linksQuery->where('deleted', false);
        }

        $totalThings = $thingsQuery->count();
        $totalLinks = $linksQuery->count();
        $serverUuid = DB::table('settings')->where('key', 'server_uuid')->value('value');

        // Stream JSON response — chunked to avoid OOM with large datasets.
        // JSON is built manually so we can interleave chunked DB results.
        return response()->stream(function () use ($thingsQuery, $linksQuery, $totalThings, $totalLinks, $serverUuid, $includeDeleted) {
            // Open JSON and write header fields
            echo '{';
            echo '"version":1,';
            echo '"exported_at":' . json_encode(now()->toIso8601String()) . ',';
            echo '"server_uuid":' . json_encode($serverUuid) . ',';
            echo '"exported_by":' . json_encode(Auth::user()->thing_id) . ',';
            echo '"include_deleted":' . json_encode($includeDeleted) . ',';
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
            echo ']}';
        }, 200, [
            'Content-Type' => 'application/json',
        ]);
    }

    /**
     * Import things and links from JSON.
     * Admin only.
     */
    public function import(ImportRequest $request)
    {
        if (!Auth::check() || !Auth::user()->is_admin) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        // Parse input JSON (from file upload or request body)
        $jsonData = null;

        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $contents = file_get_contents($file->getRealPath());
            $jsonData = json_decode($contents, true);
        } elseif ($request->isJson()) {
            $jsonData = $request->json()->all();
        } else {
            $contents = $request->getContent();
            $jsonData = json_decode($contents, true);
        }

        if (empty($jsonData) || !isset($jsonData['data'])) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid import data. Expected JSON with "data" key containing "things" and/or "links".',
            ], 422);
        }

        $conflictMode = $request->input('conflict_mode', 'latest_wins');
        $importData = $jsonData['data'];

        $result = [
            'imported' => ['things' => 0, 'links' => 0],
            'skipped'  => ['things' => 0, 'links' => 0],
            'deleted'  => ['things' => 0, 'links' => 0],
            'errors'   => [],
        ];

        try {
            DB::transaction(function () use ($importData, $conflictMode, &$result) {
                // Import things first (links reference them)
                if (!empty($importData['things'])) {
                    foreach ($importData['things'] as $thing) {
                        $this->importThing($thing, $conflictMode, $result);
                    }
                }

                // Import links
                if (!empty($importData['links'])) {
                    foreach ($importData['links'] as $link) {
                        $this->importLink($link, $conflictMode, $result);
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

        return response()->json([
            'success' => true,
            'result'  => $result,
        ]);
    }

    /**
     * Import a single thing record.
     */
    private function importThing(array $thing, string $conflictMode, array &$result): void
    {
        if (empty($thing['thing_id'])) {
            $result['errors'][] = 'Thing missing thing_id, skipping';
            return;
        }

        $existingThing = DB::table('things')->where('thing_id', $thing['thing_id'])->first();

        if ($existingThing) {
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
            DB::table('things')->where('thing_id', $thing['thing_id'])->update($updateData);
            $result['imported']['things']++;
        } else {
            // New thing — insert with all fields preserved (including owner)
            if (!empty($thing['deleted'])) {
                // Skip inserting soft-deleted things that don't exist locally
                $result['skipped']['things']++;
                return;
            }

            $insertData = $this->buildThingData($thing);
            $insertData['thing_id'] = $thing['thing_id'];
            // Preserve original owner — do NOT assign importing user as owner
            if (empty($insertData['owner'])) {
                $insertData['owner'] = $thing['owner'] ?? Auth::user()->thing_id;
            }
            // Set record_created for new records
            if (empty($insertData['record_created'])) {
                $insertData['record_created'] = now();
            }
            $insertData['record_updated'] = now();

            DB::table('things')->insert($insertData);
            $result['imported']['things']++;
        }
    }

    /**
     * Import a single link record.
     */
    private function importLink(array $link, string $conflictMode, array &$result): void
    {
        // Try matching by link_uuid first, then by unique constraint
        $existingLink = null;

        if (!empty($link['link_uuid'])) {
            $existingLink = DB::table('links')->where('link_uuid', $link['link_uuid'])->first();
        }

        if (!$existingLink && !empty($link['one_thing_id']) && !empty($link['other_thing_id']) && !empty($link['link_type_id'])) {
            $existingLink = DB::table('links')
                ->where('one_thing_id', $link['one_thing_id'])
                ->where('other_thing_id', $link['other_thing_id'])
                ->where('link_type_id', $link['link_type_id'])
                ->first();
        }

        if ($existingLink) {
            // Link exists — apply conflict resolution
            if ($conflictMode === 'keep_existing') {
                $result['skipped']['links']++;
                return;
            }

            // Handle deletion
            if (!empty($link['deleted'])) {
                DB::table('links')->where('link_id', $existingLink->link_id)->update(['deleted' => true]);
                $result['deleted']['links']++;
                return;
            }

            if ($conflictMode === 'overwrite') {
                $updateData = $this->buildLinkData($link);
                DB::table('links')->where('link_id', $existingLink->link_id)->update($updateData);
                $result['imported']['links']++;
            } else {
                // latest_wins — links don't have record_updated, so always keep existing
                $result['skipped']['links']++;
            }
        } else {
            // New link — insert
            if (!empty($link['deleted'])) {
                $result['skipped']['links']++;
                return;
            }

            $insertData = $this->buildLinkData($link);
            if (empty($insertData['link_uuid']) && !empty($link['link_uuid'])) {
                $insertData['link_uuid'] = $link['link_uuid'];
            }
            if (empty($insertData['link_uuid'])) {
                $insertData['link_uuid'] = (string) Str::uuid();
            }

            DB::table('links')->insert($insertData);
            $result['imported']['links']++;
        }
    }

    /**
     * Build thing data array from import row, excluding thing_id.
     */
    private function buildThingData(array $thing): array
    {
        $fields = ['name', 'type', 'description', 'start', 'end', 'start_variety', 'end_variety',
                   'owner', 'public', 'deleted', 'data', 'server_uuid'];

        $data = [];
        foreach ($fields as $field) {
            if (array_key_exists($field, $thing)) {
                $value = $thing[$field];
                // Encode data field back to JSON string if it's an array/object
                if ($field === 'data' && (is_array($value) || is_object($value))) {
                    $value = json_encode($value);
                }
                $data[$field] = $value;
            }
        }

        $data['record_updated'] = now();

        return $data;
    }

    /**
     * Build link data array from import row.
     */
    private function buildLinkData(array $link): array
    {
        $fields = ['link_uuid', 'one_thing_id', 'link_type_id', 'other_thing_id',
                   'translation', 'public', 'link_start', 'link_end',
                   'link_start_variety', 'link_end_variety', 'deleted'];

        $data = [];
        foreach ($fields as $field) {
            if (array_key_exists($field, $link)) {
                $data[$field] = $link[$field];
            }
        }

        return $data;
    }
}
