<?php

use Illuminate\Support\Facades\Route;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Http\Middleware\RestrictedDocsAccess;


Route::get('/', function () {
    $viteUrl = env('VITE_DEV_SERVER_URL', 'http://localhost:5173');
    return <<<HTML
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Factology</title>
        <link href="https://fonts.bunny.net/css2?family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">
    </head>
    <body>
        <div id="app"></div>
        <script type="module" src="{$viteUrl}/@vite/client"></script>
        <script type="module" src="{$viteUrl}/resources/js/app.js"></script>
    </body>
    </html>
    HTML;
});

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

