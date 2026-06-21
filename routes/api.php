<?php

use App\Http\Controllers\ApiController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\TestDatabaseController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all will be assigned
| to the "api" middleware group + api/v1 prefix.
|
*/

Route::prefix('v1')->group(function () {

    // Public authentication routes
    Route::post('/login',    [LoginController::class, 'login'])->name('login');
    Route::post('/register', [RegisterController::class, 'register'])->name('register');
    Route::post('/logout',   [LoginController::class, 'logout'])->name('logout');

    // Get current authenticated user
    Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
        return $request->user();
    })->name('user');

    // ────────────────────────────────────────────────────────────────────────────────
    // Public settings endpoint (used by frontend to check registration status)
    // ────────────────────────────────────────────────────────────────────────────────

    Route::get('/settings/public', function () {
        return response()->json([
            'data' => [
                'registration_enabled' => config('app.registration_enabled', true),
            ],
            'success' => true,
        ]);
    })->name('settings.public');

    // ────────────────────────────────────────────────────────────────────────────────
    // Data endpoints (protected by public access middleware)
    // ────────────────────────────────────────────────────────────────────────────────

    Route::middleware('check.public.access')->group(function () {
        Route::get('/object',     [ApiController::class, 'list']);
        Route::post('/object',    [ApiController::class, 'search']);
        Route::get('/object/{id}', [ApiController::class, 'get']);
        Route::get('/thumbs/{a}/{b}/{id}', [ApiController::class, 'thumb']);
    });

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/object/{id}',           [ApiController::class, 'store']);     // create
        Route::put('/object/{id}',            [ApiController::class, 'store']);     // update
        Route::delete('/object/{id}',         [ApiController::class, 'delete']);
        Route::post('/link',                  [ApiController::class, 'storeLink']);     // create
        Route::put('/link/{id}',              [ApiController::class, 'storeLink']);     // update
        Route::delete('/link/{id}',           [ApiController::class, 'deleteLink']);
        Route::post('/photos',                [ApiController::class, 'photos']);
        Route::post('/check_photos',          [ApiController::class, 'checkPhotos']);
        Route::post('/photos/thumbs_upload',  [ApiController::class, 'upload']);
    });
});

// ============================================
// TESTING ROUTES (only available in testing environment)
// ============================================

if (app()->environment('testing')) {
    Route::prefix('test')->group(function () {
        // Database management
        Route::post('/reset',          [TestDatabaseController::class, 'reset']);
        Route::post('/migrate',        [TestDatabaseController::class, 'migrate']);
        Route::get('/migration-status', [TestDatabaseController::class, 'migrationStatus']);
        Route::post('/clean-all',      [TestDatabaseController::class, 'cleanAll']);
        Route::get('/status',          [TestDatabaseController::class, 'status']);

        // User management
        Route::post('/create-user',    [TestDatabaseController::class, 'createUser']);
        Route::delete('/users/{id}',   [TestDatabaseController::class, 'deleteUser']);
    });
}
