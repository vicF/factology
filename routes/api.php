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


Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return $request->user();
});

Route::get('/v1/object', [ApiController::class, 'list']);
Route::post('/v1/object', [ApiController::class, 'search']);
Route::get('/v1/object/{id}', [ApiController::class, 'get']);
// New object with uuid generated on client
Route::middleware('auth:sanctum')->post('/v1/object/{id}', [ApiController::class, 'store']);
// Save existing object
Route::middleware('auth:sanctum')->put('/v1/object/{id}', [ApiController::class, 'store']);
Route::middleware('auth:sanctum')->delete('/v1/object/{id}', [ApiController::class, 'delete']);
Route::middleware('auth:sanctum')->post('/v1/photos', [ApiController::class, 'photos']);
Route::middleware('auth:sanctum')->post('/v1/check_photos', [ApiController::class, 'checkPhotos']);
Route::middleware('auth:sanctum')->post('/v1/photos/thumbs_upload', [ApiController::class, 'upload']);
Route::middleware('auth:sanctum')->get('/user', [LoginController::class, 'user']);
