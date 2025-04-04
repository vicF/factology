<?php

use App\Http\Controllers\ApiController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

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
use Illuminate\Support\Facades\Auth;

Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return $request->user();
});

Route::get('/v1/object', [ApiController::class, 'list']);
Route::post('/v1/object', [ApiController::class, 'search']);
Route::get('/v1/object/{id}', [ApiController::class, 'get']);
Route::middleware('auth:sanctum')->post('/v1/object/{id}', [ApiController::class, 'store']);
Route::middleware('auth:sanctum')->put('/v1/object', [ApiController::class, 'store']);
Route::middleware('auth:sanctum')->delete('/v1/object/{id}', [ApiController::class, 'delete']);
Route::middleware('auth:sanctum')->post('/v1/photos', [ApiController::class, 'photos']);
Route::middleware('auth:sanctum')->post('/v1/check_photos', [ApiController::class, 'checkPhotos']);
Route::middleware('auth:sanctum')->post('/v1/photos/thumbs_upload', [ApiController::class, 'upload']);
Route::post('/login', function (Request $request) {
$credentials = $request->only('email', 'password');
if (Auth::attempt($credentials)) {
$request->session()->regenerate();
return response()->json(['user' => Auth::user()], 200);
}
return response()->json(['message' => 'Invalid credentials'], 401);
});
