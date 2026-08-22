<?php

namespace App\Http\Controllers;

use App\Services\Importer\DuplicatePersonMatcher;
use App\Services\Importer\GedcomImporter;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Support\Facades\Auth;

class ImportController extends BaseController
{
    /**
     * Import a GEDCOM file via API upload.
     * POST /api/v1/import/gedcom
     */
    public function importGedcom(Request $request)
    {
        $request->validate([
            'file' => 'required|file|mimes:ged,txt|max:65536', // 64MB max
        ]);

        $user = Auth::user();
        $ownerId = $user->thing_id;

        $file = $request->file('file');
        $contents = file_get_contents($file->getRealPath());

        if ($contents === false || trim($contents) === '') {
            return response()->json([
                'success' => false,
                'message' => 'Empty or unreadable file',
            ], 422);
        }

        try {
            $importer = new GedcomImporter($ownerId, null, $contents);
            $result = $importer->import($contents);

            return response()->json([
                'success' => true,
                'result'  => $result,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Import failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Find duplicate persons imported from GEDCOM files and link them with
     * DUPLICATE_OF. Runs against the authenticated user's own data.
     * POST /api/v1/import/find-duplicates
     */
    public function findDuplicates(Request $request)
    {
        $user = Auth::user();

        try {
            $result = (new DuplicatePersonMatcher())->findDuplicates($user->thing_id);

            return response()->json([
                'success' => true,
                'result'  => $result,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Duplicate search failed: ' . $e->getMessage(),
            ], 500);
        }
    }
}