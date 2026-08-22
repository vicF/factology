<?php

use App\Http\Controllers\ApiController;
use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\RegisterController;
use App\Http\Controllers\LegalController;
use App\Http\Controllers\ExportImportController;
use App\Http\Controllers\ImportController;
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

    // Legal document routes (public)
    Route::get('/legal', [LegalController::class, 'index'])->name('legal.index');
    Route::get('/legal/{type}', [LegalController::class, 'show'])->name('legal.show');

    // Public authentication routes
    Route::post('/login',    [LoginController::class, 'login'])->name('login');
    Route::post('/register', [RegisterController::class, 'register'])->name('register');
    Route::post('/logout',   [LoginController::class, 'logout'])->name('logout');

    // Get current authenticated user (explicitly expose is_admin)
    Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
        $user = $request->user();
        return response()->json([
            'id'       => $user->id,
            'name'     => $user->name,
            'email'    => $user->email,
            'thing_id' => $user->thing_id,
            'is_admin' => (bool) $user->is_admin,
        ]);
    })->name('user');

    // ────────────────────────────────────────────────────────────────────────────────
    // Public settings endpoint (used by frontend to check registration status)
    // ────────────────────────────────────────────────────────────────────────────────

    Route::get('/settings/public', function () {
        return response()->json([
            'data' => [
                'registration_enabled' => config('app.registration_enabled', true),
                'public_objects_visibility' => config('app.public_objects_visibility', 'everyone'),
            ],
            'success' => true,
        ]);
    })->name('settings.public');

    // ────────────────────────────────────────────────────────────────────────────────
    // Data endpoints (protected by public access middleware)
    // ────────────────────────────────────────────────────────────────────────────────

    Route::middleware('check.public.access')->group(function () {
        Route::get('/object',       [ApiController::class, 'list']);
        Route::post('/object',      [ApiController::class, 'search']);
        Route::get('/object/{id}',  [ApiController::class, 'get']);
        Route::get('/properties',   [ApiController::class, 'properties']);
        Route::get('/geocode',      [ApiController::class, 'geocode']);
        Route::get('/class/{id}/properties', [ApiController::class, 'classProperties']);
        Route::get('/thumbs/{a}/{b}/{id}', [ApiController::class, 'thumb']);
        Route::get('/search/options', [ApiController::class, 'searchOptions']);
    });

    // Client-side error reporting (no auth required)
    Route::post('/client-error', function (Request $request) {
        $validated = $request->validate([
            'message'  => 'required|string',
            'type'     => 'nullable|string',
            'url'      => 'nullable|string',
            'stack'    => 'nullable|string',
            'status'   => 'nullable|integer',
        ]);

        \Illuminate\Support\Facades\Log::channel('json')->warning('client_error', $validated);
        return response()->json(['success' => true]);
    });

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/object/{id}',           [ApiController::class, 'store']);     // create
        Route::put('/object/{id}',            [ApiController::class, 'store']);     // update
        Route::patch('/object/{id}/visibility', [ApiController::class, 'toggleVisibility']);
        Route::delete('/object/{id}',         [ApiController::class, 'delete']);
        Route::post('/link',                  [ApiController::class, 'storeLink']);     // create
        Route::put('/link/{id}',              [ApiController::class, 'storeLink']);     // update
        Route::delete('/link/{id}',           [ApiController::class, 'deleteLink']);
        Route::post('/photos',                [ApiController::class, 'photos']);
        Route::post('/check_photos',          [ApiController::class, 'checkPhotos']);
        Route::post('/photos/thumbs_upload',  [ApiController::class, 'upload']);

        // History / favorites
        Route::post('/suggest/links',         [ApiController::class, 'suggestLinks']);
        Route::get('/suggest/lists',          [ApiController::class, 'suggestLists']);
        Route::post('/object/{id}/favorite',  [ApiController::class, 'toggleFavorite']);

        // Export/Import (admin-only, enforced in controller)
        Route::get('/export',                 [ExportImportController::class, 'export']);
        Route::post('/import',                [ExportImportController::class, 'import']);

        // GEDCOM import (any authenticated user imports into their own tree)
        Route::post('/import/gedcom',         [ImportController::class, 'importGedcom']);
        Route::post('/import/find-duplicates', [ImportController::class, 'findDuplicates']);
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

        // Seed test data for acceptance tests
        Route::post('/seed-objects',   [TestDatabaseController::class, 'seedTestObjects']);
    });
}
