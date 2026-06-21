<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CheckPublicAccess
{
    /**
     * Handle an incoming request.
     *
     * When PUBLIC_OBJECTS_VISIBILITY is 'registered_only',
     * unauthenticated users get a 401 response.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @return mixed
     */
    public function handle(Request $request, Closure $next)
    {
        if (config('app.public_objects_visibility') === 'registered_only' && !Auth::check()) {
            return response()->json([
                'success' => false,
                'message' => 'Authentication required. Please log in.',
            ], 401);
        }

        return $next($request);
    }
}
