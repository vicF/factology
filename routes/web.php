<?php

use Illuminate\Support\Facades\Route;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Http\Middleware\RestrictedDocsAccess;


Route::get('/', function () {
    $devUrl = env('VITE_DEV_SERVER_URL', 'http://localhost:5173');
    $isDev = env('APP_ENV') === 'local' || file_exists(public_path('hot'));
    if ($isDev) {
        $head = '';
        $body = <<<SCRIPTS
        <script type="module" src="{$devUrl}/@vite/client"></script>
        <script type="module" src="{$devUrl}/resources/js/app.js"></script>
        SCRIPTS;
    } else {
        $manifest = json_decode(file_get_contents(public_path('build/manifest.json')), true);
        $entry = $manifest['resources/js/app.js'] ?? [];
        $body = '<script type="module" src="/build/' . ($entry['file'] ?? 'assets/app.js') . '"></script>';
        $cssLinks = '';
        foreach ($entry['css'] ?? [] as $css) {
            $cssLinks .= "\n        " . '<link rel="stylesheet" href="/build/' . $css . '">';
        }
        $head = $cssLinks;
    }
    return <<<HTML
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Factology</title>
        <link href="https://fonts.bunny.net/css2?family=Nunito:wght@400;600;700&display=swap" rel="stylesheet">{$head}
    </head>
    <body>
        <div id="app"></div>
        {$body}
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

