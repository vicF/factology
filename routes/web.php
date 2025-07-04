<?php

use App\Http\Controllers\Auth\RegisterController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Auth\LoginController;

Route::post('/login', [LoginController::class, 'login'])->name('login')->middleware('web');
Route::post('/logout', [LoginController::class, 'logout'])->name('logout')->middleware('web');
Route::get('/user', [LoginController::class, 'user'])->name('user')->middleware('auth:sanctum');
Route::post('/register', [RegisterController::class, 'create'])->name('create')->middleware('web');

// SPA route, exclude static assets
Route::get('{any}', function () {
    return view('welcome');
})->where('any', '^(?!build|js|css|images|fonts|storage|api|sanctum).*')->name('spa');

// Remove Auth::routes() to avoid conflicts
// Route::get('/home', [App\Http\Controllers\HomeController::class, 'index'])->name('home');
