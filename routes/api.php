<?php

use App\Http\Controllers\ApiController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\LoginController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

// Standard Sanctum user route - keep this one (closure is reliable)
Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    \Log::info('API /user called', [
        'auth_check' => Auth::check(),
        'user_id' => Auth::id(),
        'session_id' => session()->getId(),
    ]);

    return $request->user() ?? response()->json(['message' => 'Unauthenticated'], 401);
});

// Removed duplicate /user route (was causing conflicts or wrong response)
// If you need custom user logic, extend the closure above or use a different path (e.g. /me)

// Other API routes
Route::get('/v1/object', [ApiController::class, 'list']);
Route::post('/v1/object', [ApiController::class, 'search']);
Route::get('/v1/object/{id}', [ApiController::class, 'get']);

// Protected routes for objects and photos
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/v1/object/{id}', [ApiController::class, 'store']); // New object
    Route::put('/v1/object/{id}', [ApiController::class, 'store']);  // Update object
    Route::delete('/v1/object/{id}', [ApiController::class, 'delete']);
    Route::delete('/v1/link/{id}', [ApiController::class, 'deleteLink']);
    Route::post('/v1/photos', [ApiController::class, 'photos']);
    Route::post('/v1/check_photos', [ApiController::class, 'checkPhotos']);
    Route::post('/v1/photos/thumbs_upload', [ApiController::class, 'upload']);
});
