<?php

namespace App\Http\Controllers;

use App\Services\DatabaseConsistencyChecker;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

/**
 * Tools page endpoints. Consistency check is DB-wide and read-only, so it is
 * restricted to admins.
 */
class ToolsController extends Controller
{
    /**
     * Run the database consistency audit.
     * POST /api/v1/tools/consistency-check
     */
    public function consistencyCheck(): JsonResponse
    {
        abort_unless(Auth::check() && Auth::user()->is_admin, 403, 'Admin access required');

        return response()->json([
            'success' => true,
            'result'  => (new DatabaseConsistencyChecker())->check(),
        ]);
    }
}
