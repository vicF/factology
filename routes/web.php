<?php

use Illuminate\Support\Facades\Route;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Http\Middleware\RestrictedDocsAccess;

// ✅ Documentation routes FIRST (these will be handled by Laravel)
Route::get('/docs/api', function () {
    return Scramble::ui('api');
})->middleware(RestrictedDocsAccess::class);

Route::get('/docs/api.json', function () {
    return Scramble::spec('api');
})->middleware(RestrictedDocsAccess::class);

// SPA route, exclude static assets and api/sanctum paths
Route::get('{any}', function () {
    return view('welcome');
})->where('any', '^(?!build|js|css|images|fonts|storage|api|sanctum).*')->name('spa');

// Remove Auth::routes() to avoid conflicts
// Route::get('/home', [App\Http\Controllers\HomeController::class, 'index'])->name('home');
