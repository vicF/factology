<?php

namespace App\Http\Controllers;

use App\Models\Classes\Everything;
use App\Services\DatabaseConsistencyChecker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Tools page endpoints.
 *
 * The consistency check is available to every authenticated user, but it is
 * scoped: non-admin users only see (and can delete) objects they own. Admins
 * get a DB-wide audit.
 */
class ToolsController extends Controller
{
    /**
     * Run the database consistency audit.
     * POST /api/v1/tools/consistency-check
     */
    public function consistencyCheck(): JsonResponse
    {
        $user = Auth::user();

        return response()->json([
            'success' => true,
            'result'  => (new DatabaseConsistencyChecker())->check(
                $user->is_admin ? null : $user->thing_id
            ),
        ]);
    }

    /**
     * Delete the erroneous objects selected in the consistency report.
     * POST /api/v1/tools/consistency-delete
     *
     * Body: { "ids": ["thing_id", ...] }
     *
     * Rights mirror ApiController::delete: admins may delete any object,
     * everyone else only objects they own. Objects the caller has no rights to
     * are skipped silently.
     */
    public function deleteSelected(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids'   => 'required|array',
            'ids.*' => 'string',
        ]);

        $user = Auth::user();
        $deleted = 0;
        $failed = [];

        foreach (array_unique($validated['ids']) as $id) {
            $existing = DB::table('things')->where('thing_id', $id)->first();
            if (!$existing) {
                continue;
            }
            if (!$user->is_admin && $existing->owner !== $user->thing_id) {
                continue;
            }
            try {
                if (Everything::deleteById($id)) {
                    $deleted++;
                } else {
                    $failed[] = $id;
                }
            } catch (\Throwable $e) {
                // E.g. a hard delete blocked by a non-cascading FK (users.thing_id).
                $failed[] = $id;
            }
        }

        return response()->json([
            'success' => true,
            'deleted' => $deleted,
            'failed'  => $failed,
        ]);
    }
}
